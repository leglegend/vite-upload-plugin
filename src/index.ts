// vite 静态资源上传cdn plugin
import { UserConfig } from 'vite'
import { CustomSetting } from './types'
import { uploadFile, initOption } from './qupload'
import path from 'path'
import fs from 'fs'

type FileDetail = {
  fileName: string
  fullPath: string
  prefix?: string
}

// 去掉js文件中的公共路径
function removePublicPath(publicPath: string, assetStringValue: string) {
  if (!publicPath) return assetStringValue
  return assetStringValue.replace(publicPath, 'return""+')
}

// 判断是文件还是文件夹
function isFile(dir: string) {
  return fs.lstatSync(dir).isFile()
}

// 递归查找输出目录的所有文件
function deepReaddir(dir: string, prefix?: string): FileDetail[] {
  return fs.readdirSync(dir).flatMap((fileName) => {
    const completePath = path.join(dir, fileName)

    if (isFile(completePath)) {
      if (/\.(txt|map)$/.test(fileName)) return []
      return {
        fileName: fileName,
        prefix,
        fullPath: completePath
      }
    } else return deepReaddir(completePath, prefix + fileName + '/')
  })
}

/**
 * 不用正则的方式替换所有值
 * @param text 被替换的字符串
 * @param checker  替换前的内容
 * @param replacer 替换后的内容
 * @returns {String} 替换后的字符串
 */
function replaceAll(text: string, checker: string, replacer: string): string {
  let lastText = text
  text = text.replace(checker, replacer)
  if (lastText !== text) {
    return replaceAll(text, checker, replacer)
  }
  return text
}

let base = '/'
let outputDir = 'dist'

const viteUploadPlugin = (option: CustomSetting) => ({
  name: 'vite-upload-plugin',
  config: (config: UserConfig) => {
    // 记录传进来的公共路径
    base = config.base || '/'
    // 如果公共路径不是以/结尾，再末尾加上/
    if (!/\/$/.test(base)) base += '/'

    if (config.build?.outDir) outputDir = config.build?.outDir

    initOption(option)
    return {
      base
    }
  },

  closeBundle: async () => {
    // 文件输出路径
    outputDir = path.resolve(process.cwd(), outputDir)
    // 计算文件列表
    const fileList = deepReaddir(outputDir, '')

    // 找到入口文件
    const enters = fileList.filter((file) => /\.html$/.test(file.fileName))

    // 保存已上传文件的路径
    const uploadedFiles: string[] = []

    // 保存已上传CDN文件的路径，防止同一个文件多次上传
    const already = new Map()

    // 深度遍历需要替换资源的文件
    async function dfs(current: FileDetail, exists = new Map()) {
      // 已存在引用过的文件，存在循环引用
      if (exists.get(current.fileName)) {
        for (const key of exists.keys()) {
          console.warn(key)
        }
        console.error(current.fileName)
        throw new Error('发生循环引用')
      }

      exists.set(current.fileName, true)
      // 只有js/html/css文件中会引用其他文件
      if (/\.(js|html|css)$/.test(current.fileName)) {
        // 文件资源的字符串
        let assetStringValue = fs.readFileSync(current.fullPath, 'utf8')

        if (/\.js$/.test(current.fileName)) {
          // js文件需要去掉公共路径，不然引用会有问题
          assetStringValue = removePublicPath(
            `return"${base}"+`,
            assetStringValue
          )
        }

        // 是否需要重写内容，如果文件引用了其他文件，则需要修改文件内的引用地址
        let needReplace = false

        for (let file of fileList) {
          // 过滤当前文件
          if (current.fileName === file.fileName) continue

          // 过滤html文件
          if (/\.html$/.test(file.fileName)) continue

          // 当文件内容包含其他文件名称时
          if (assetStringValue?.includes(file.fileName)) {
            // 文件内容中包含别的文件，所以之后需要重写文件内容
            needReplace = true

            // 通过深度遍历查询被引用的文件是否还引用了其他文件
            const newPath =
              already.get(file.fileName) || (await dfs(file, exists))

            // 所有类型文件都存在公共路径+文件路径引用的方式
            assetStringValue = replaceAll(
              assetStringValue,
              base + file.prefix + file.fileName,
              newPath
            )

            // 如果当前文件为js文件
            // 则额外存在./+文件名 和 路径+文件名两种引用方式
            if (/\.js$/.test(current.fileName)) {
              assetStringValue = replaceAll(
                assetStringValue,
                file.prefix + file.fileName,
                newPath
              )
              assetStringValue = replaceAll(
                assetStringValue,
                './' + file.fileName,
                newPath
              )
            }
          }
        }

        // 将文件资源替换成修改后的
        if (needReplace) {
          fs.writeFileSync(current.fullPath, assetStringValue)
        }
      }

      // html不用上传 直接返回
      if (/\.html$/.test(current.fileName)) return current.fileName

      // 在这里进行上传操作，并获取到上传后的新路径
      const newKey = await uploadFile(current.fullPath)

      // 上传完成后保存源文件路径，打包结束后删除
      uploadedFiles.push(current.fullPath)

      // 并将新路径放进Map中
      already.set(current.fileName, newKey)

      // 从引用列表中删除当前文件
      exists.delete(current.fileName)

      // 返回修改后的资源名称
      return newKey
    }

    for (const file of enters) {
      await dfs(file, new Map())
    }

    // 删除已上传的文件
    uploadedFiles.forEach((path) => fs.unlinkSync(path))

    return Promise.resolve()
  }
})

export default viteUploadPlugin
