/** アーティスト名を「A / B / C ほか○組」の形にする（タイトル・説明文が長くなりすぎないように） */
export function artistNamesText(names: (string | null | undefined)[], max = 3, sep = ' / '): string {
  const list = names.filter((n): n is string => !!n)
  if (list.length <= max) return list.join(sep)
  return `${list.slice(0, max).join(sep)} ほか${list.length - max}組`
}
