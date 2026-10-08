/**
 * 「該当なし」以外の DB エラー（タイムアウト・接続エラー等）は例外にする。
 * data が null のまま notFound() に進むと、404 ページが ISR キャッシュに残って
 * 実在するページが最長1時間（以上）404 になるため。例外ならキャッシュ済みの前の版が出続ける。
 */
export function throwIfDbError(error: { code?: string; message: string } | null): void {
  if (error && error.code !== 'PGRST116') throw new Error(error.message)
}
