/**
 * 出演者がこの数以上の公演・ツアーは「イベント」として表示する（2026-10-15 ユーザー決定: 5組以上）
 *   紅白・音楽の日・フェスのように主催アーティストがいないものに、取り込み元のアーティストの写真や名前を出さないため。
 *   データ（主催アーティスト）は変えず、表示だけ切り替える
 */
export const EVENT_MIN_PERFORMERS = 5

export function isEventByPerformers(count: number | null | undefined): boolean {
  return (count ?? 0) >= EVENT_MIN_PERFORMERS
}
