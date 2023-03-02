import { upload } from '@q/qcdn'
import { CustomSetting } from './types'

let opts = {
  https: true,
  image: {
    domains: ['p1.ssl.qhimg.com', 'p2.ssl.qhimg.com']
  },
  static: {
    domains: [
      's0.ssl.qhimg.com',
      's1.ssl.qhimg.com',
      's2.ssl.qhimg.com',
      's3.ssl.qhimg.com'
    ]
  }
}

export function initOption(option: CustomSetting) {
  opts = {
    ...opts,
    ...option
  }
}

export function uploadFile(file: any) {
  return new Promise<string>((resolve, reject) => {
    upload(file, opts)
      .then((res: any) => {
        resolve(res[file] as string)
      })
      .catch((e: any) => {
        reject(e)
      })
  })
}
