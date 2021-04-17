import { getMonuments } from '../map'
import {
  AppMarker,
  LargeOilRigCrateHackedMapEvent,
  Monument,
  ServerInfo
} from '../types'
import { distance } from '../../math'

const isMarkerChinook = (marker: AppMarker) => marker.type === 'CH47'
const CHINOOK_LARGE_OILRIG_SPAWN_CUT_OFF = 600

const isCrateHackedChinook = (
  spawnedChinook: AppMarker,
  largeOilRig: Monument
): boolean =>
  distance(spawnedChinook, largeOilRig) <= CHINOOK_LARGE_OILRIG_SPAWN_CUT_OFF

const createLargeOilRigCrateHackedEvent = (): LargeOilRigCrateHackedMapEvent => ({
  type: 'LARGE_OIL_RIG_CRATE_HACKED' as const,
  data: null
})

export async function ch47(
  server: ServerInfo,
  newMarkers: AppMarker[]
): Promise<LargeOilRigCrateHackedMapEvent[]> {
  const monuments = await getMonuments(server)
  const largeOilRig = monuments.find((m) => m.token === 'large_oil_rig')
  if (!largeOilRig) return []
  const chinooks = newMarkers.filter(isMarkerChinook)
  const chinooksNearLargeOilRig = chinooks.filter((c) =>
    isCrateHackedChinook(c, largeOilRig)
  )
  return chinooksNearLargeOilRig.map(() => createLargeOilRigCrateHackedEvent())
}
