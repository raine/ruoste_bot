export type MaxGroupParameter = { minMaxGroup: number; maxMaxGroup: number }

export function parseMaxGroupOption(
  msg: string
): MaxGroupParameter | undefined {
  let match
  match = msg.match(/maxgroup=(\d)?-(\d)?/)
  if (match) {
    const minMaxGroup = match[1] ? parseInt(match[1]) : 1
    const maxMaxGroup = match[2] ? parseInt(match[2]) : Infinity

    return { minMaxGroup, maxMaxGroup }
  }
  match = msg.match(/maxgroup=(\d)\b/)
  if (match) {
    const exactGroupSize = parseInt(match[1])
    return {
      minMaxGroup: exactGroupSize,
      maxMaxGroup: exactGroupSize
    }
  }
}
