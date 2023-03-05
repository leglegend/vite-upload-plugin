export type CustomSetting = {
  // 上传文件
  upload: (path: string) => Promise<string>
}

export type FileDetail = {
  fileName: string
  fullPath: string
  prefix?: string
}

export type Job = { fileName: string; cb: () => Promise<void> }
