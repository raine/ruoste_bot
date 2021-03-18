import { TypedEmitter } from 'tiny-typed-emitter'
import * as uuid from 'uuid'

type OnFcmNotification = (n: any) => void

const STORAGE_MONITOR_PAIRING = {
  notification: {
    data: {
      title: 'Storage Monitor',
      message: 'Tap to pair with this device.',
      body:
        '{"img":"https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/0T35W1\\/server-header.png","entityType":"3","ip":"51.77.57.19","entityId":"1234","type":"entity","url":"http:\\/\\/www.playrust.com\\/","playerToken":"1234","port":"28083","entityName":"Storage Monitor","name":"[RU] Facepunch 4","logo":"https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/1Z61F1\\/04_07-48-MagnificentLadybug.png","id":"cdfeccce-7c2f-4d02-8a99-b94a183f3ada","desc":"This is an official server owned and operated by Facepunch. \\\\n \\\\n People are free to speak whatever language they like. Don\'t be surprised if you get banned for being abusive.","playerId":"1234"}',
      channelId: 'pairing'
    }
  },
  persistentId: uuid.v4()
}

const ALARM = {
  notification: {
    data: {
      title: 'Alarm',
      message: 'Your base is under attack!',
      body:
        '{"img":"https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/0T35W1\\/server-header.png","port":"28083","ip":"51.77.57.19","name":"[RU] Facepunch 4","logo":"https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/1Z61F1\\/04_07-48-MagnificentLadybug.png","id":"cdfeccce-7c2f-4d02-8a99-b94a183f3ada","url":"http:\\/\\/www.playrust.com\\/","desc":"This is an official server owned and operated by Facepunch. \\\\n \\\\n People are free to speak whatever language they like. Don\'t be surprised if you get banned for being abusive."}',
      channelId: 'alarm'
    }
  },
  persistentId: uuid.v4()
}

interface FakePushReceiverEvents {
  connect: () => void
}

class FakePushReceiver extends TypedEmitter<FakePushReceiverEvents> {
  constructor(onFcmNotification: OnFcmNotification) {
    super()

    process.nextTick(() => {
      this.emit('connect')

      setTimeout(() => {
        onFcmNotification(ALARM)
      }, 1000)
    })
  }

  destroy() {}
}

export function listen(
  credentials: unknown,
  onFcmNotification: OnFcmNotification
) {
  return new FakePushReceiver(onFcmNotification)
}

export default {
  listen
}
