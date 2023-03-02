# vite-upload-plugin
一款vite插件，能够自动将静态资源上传至CDN服务器，并替换源文件地址
## 安装
```js
npm i @q/vite-upload-plugin -D 

# yarn 
yarn add @q/vite-upload-plugin -D
```
## 使用
在vite.config文件中直接使用：
```js
import viteUploadPlugin from '@q/vite-upload-plugin'

export default defineConfig({
  plugins: [
    viteUploadPlugin({
      https: true, // 是否使用https
      image: {
        domains: [] // 图片上传cdn服务器地址列表
      },
      static: {
        domains: [] // 静态资源上传cdn服务器地址列表
      }
    })
  ],
  // 注意，下面的配置是必须的
  build: {
    rollupOptions: {
      manualChunks(id) {
        if (id.includes('node_modules') || id.includes('App')) {
          return 'vendor'
        }
      }
    }
  }
})
```
当进行打包操作时，资源会自动上传并替换源文件链接。
## 注意
配置中对代码的分割逻辑是必须的，vite默认会把node_modules中的代码打到入口文件中，导致入口文件和其他文件产生循环引用关系，最终无法完成上传，需要将node_modules中的代码分割为独立的包，以免发生循环引用问题。
## 关于qcdn
上面的例子只包含qcdn的部分操作，完整配置可参照[@q/qcdn](http://qnpm.qiwoo.org/package/@q/qcdn)
## 维护
有任何问题请联系 倪特(<z-nite@sharingmail.cn>)