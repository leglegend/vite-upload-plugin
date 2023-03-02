export type CustomSetting = {
  /** 是否使用https */
  https?: boolean

  /** 图片上传cdn域名 */
  image?: {
    domains: string[]
  }

  /** 静态资源上传cdn域名 */
  static?: {
    domains: string[]
  }
}
