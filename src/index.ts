// vite 静态资源上传cdn plugin
import { UserConfig } from 'vite'
import { CustomSetting, FileDetail, Job } from './types'
import path from 'path'
import fs from 'fs'

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
 * @returns {string} 替换后的字符串
 */
function replaceAll(text: string, checker: string, replacer: string): string {
  let lastText = text
  text = text.replace(checker, replacer)
  if (lastText !== text) {
    return replaceAll(text, checker, replacer)
  }
  return text
}

// 使用 Promise.resolve()创建一个Promise实例，可将一个任务添加到微任务队列
const p = Promise.resolve()
// 是否锁定微任务队列
let lock = false

let queue: Job[] = []

function queueJob(job: Job) {
  queue.push(job)

  if (lock) return

  lock = true

  p.then(async () => {
    // 本轮微任务需要执行的任务列表
    const currentJobs: Job[] = []
    // 本轮微任务不执行，需要放进下轮微任务执行的任务列表
    const newQueue = []

    while (queue.length) {
      // 逐个取出队列中的任务
      const current = queue.shift()!
      // 当前任务已存在于本轮执行列表，则放入下一轮执行
      if (currentJobs.find((j) => j.fileName === current.fileName)) {
        newQueue.push(current)
      } else {
        currentJobs.push(current)
      }
    }

    // 执行本轮任务
    await Promise.all(currentJobs.map((j) => j.cb()))

    // 本轮任务执行完成后，解锁微任务队列
    lock = false

    // 将本轮未执行的任务推进任务队列
    newQueue.forEach((job) => {
      queueJob(job!)
    })

    // 如果任务队列中有任务，但是下一轮任务队列中无任务，重新触发任务队列
    if (!newQueue.length && queue.length) queueJob(queue.pop()!)
  })
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
    const already = new Map<string, string>()

    // 深度遍历需要替换资源的文件
    async function dfs(
      current: FileDetail,
      exists = new Map()
    ): Promise<string> {
      // 已上传的文件，直接返回
      if (already.get(current.fileName)) return already.get(current.fileName)!

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

        // 当前文件引用的文件列表
        const linkFiles: FileDetail[] = []

        // 检测当前文件引用了哪些文件
        for (let file of fileList) {
          // 过滤当前文件
          if (current.fileName === file.fileName) continue

          // 过滤html文件
          if (/\.html$/.test(file.fileName)) continue

          // 当文件内容包含其他文件名称时
          if (assetStringValue?.includes(file.fileName)) {
            linkFiles.push(file)
          }
        }

        if (linkFiles.length) {
          // 等待引用的文件全部上传完毕后再进行替换操作
          await Promise.all(linkFiles.map((file) => dfs(file, new Map(exists))))

          for (let file of linkFiles) {
            // 获取引用文件的cdn路径
            const newPath = already.get(file.fileName)

            if (!newPath) continue

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

          // 将文件资源替换成修改后的
          fs.writeFileSync(current.fullPath, assetStringValue)
        }
      }

      // html不用上传 直接返回
      if (/\.html$/.test(current.fileName)) return current.fileName

      // 在这里进行上传操作，并获取到上传后的新路径
      const newKey: string = await new Promise((resolve) => {
        // 将上传任务推进一个队列中，当该任务被执行时，cb函数会被调用
        queueJob({
          fileName: current.fileName,
          cb: async () => {
            if (already.get(current.fileName)) {
              resolve(already.get(current.fileName)!)
            } else {
              console.log('开始上传' + current.fileName)
              resolve(await option.upload(current.fullPath))
              console.log('上传结束' + current.fileName)

              // 上传完成后保存源文件路径，打包结束后删除
              uploadedFiles.push(current.fullPath)
            }
          }
        })
      })

      // 并将新路径放进Map中
      already.set(current.fileName, newKey)

      // 从引用列表中删除当前文件
      exists.delete(current.fileName)

      // 返回修改后的资源名称
      return newKey
    }

    // 对所有入口进行深度查询
    await Promise.all(enters.map((file) => dfs(file, new Map())))

    // 删除已上传的文件
    uploadedFiles.forEach((path) => fs.unlinkSync(path))

    return Promise.resolve()
  }
})

export default viteUploadPlugin
