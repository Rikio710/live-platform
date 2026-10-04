// /articles/page/2 以降（中身は /articles と同じ）
export const revalidate = 3600
export function generateStaticParams() { return [] }
export { default, generateMetadata } from '../../page'
