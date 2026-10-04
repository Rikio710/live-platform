// /articles/category/[category]/page/2 以降（中身は1ページ目と同じ）
export const revalidate = 3600
export function generateStaticParams() { return [] }
export { default, generateMetadata } from '../../page'
