import { TypedEmitter } from 'tiny-typed-emitter'
import * as uuid from 'uuid'

type OnFcmNotification = (n: any) => void

const FAKE_EVENTS = {
  smartSwitch: {
    notification: {
      data: {
        experienceId: '@facepunch/RustCompanion',
        title: 'Switch',
        message: 'Tap to pair with this device.',
        body: JSON.stringify({
          img: '',
          entityType: '1',
          ip: '91.153.57.216',
          entityId: '1269944',
          type: 'entity',
          url: '',
          playerToken: '-1049670749',
          port: '28083',
          entityName: 'Switch',
          name: 'best test server eu',
          logo: '',
          id: '9e9c7875-b315-44ed-ab20-f1310034448d',
          desc: 'No server description has been provided.',
          playerId: '76561197960440354'
        }),
        channelId: 'pairing'
      },
      from: '976529667804',
      priority: 'high',
      collapse_key: 'do_not_collapse'
    },
    persistentId: uuid.v4()
  },

  storageMonitor: {
    notification: {
      data: {
        title: 'Storage Monitor',
        message: 'Tap to pair with this device.',
        body: JSON.stringify({
          img:
            'https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/0T35W1\\/server-header.png',
          entityType: '3',
          ip: '91.153.57.216',
          entityId: '1234',
          type: 'entity',
          url: 'http:\\/\\/www.playrust.com\\/',
          playerToken: '1234',
          port: '28083',
          entityName: 'Storage Monitor',
          name: '[RU] Facepunch 4',
          logo:
            'https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/1Z61F1\\/04_07-48-MagnificentLadybug.png',
          id: 'cdfeccce-7c2f-4d02-8a99-b94a183f3ada',
          desc:
            "This is an official server owned and operated by Facepunch. \\\\n \\\\n People are free to speak whatever language they like. Don't be surprised if you get banned for being abusive.",
          playerId: '1234'
        }),
        channelId: 'pairing'
      }
    },
    persistentId: uuid.v4()
  },

  alarm: {
    notification: {
      data: {
        title: 'Alarm',
        message: 'Your base is under attack!',
        body: JSON.stringify({
          img:
            'https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/0T35W1\\/server-header.png',
          port: '28083',
          ip: '51.77.57.19',
          name: '[RU] Facepunch 4',
          logo:
            'https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/1Z61F1\\/04_07-48-MagnificentLadybug.png',
          id: 'cdfeccce-7c2f-4d02-8a99-b94a183f3ada',
          url: 'http:\\/\\/www.playrust.com\\/',
          desc:
            "This is an official server owned and operated by Facepunch. \\\\n \\\\n People are free to speak whatever language they like. Don't be surprised if you get banned for being abusive."
        }),
        channelId: 'alarm'
      }
    },
    persistentId: uuid.v4()
  },

  serverPairing: {
    notification: {
      data: {
        experienceId: '@facepunch/RustCompanion',
        title: 'best test server eu',
        message: 'Tap to pair with this server.',
        body: JSON.stringify({
          img: '',
          port: '28083',
          ip: '91.120.57.123',
          name: 'best test server eu',
          logo: '',
          id: '9e9c7875-b315-44ed-ab20-f1310034448d',
          type: 'server',
          url: '',
          desc: 'No server description has been provided.',
          playerId: '76561199410440354',
          playerToken: '-1039270142'
        }),
        channelId: 'pairing'
      },
      from: '976529667804',
      priority: 'high',
      collapse_key: 'do_not_collapse'
    },
    persistentId: uuid.v4(),
    msg: 'FCM notification received'
  }
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
        onFcmNotification(FAKE_EVENTS.storageMonitor)
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
