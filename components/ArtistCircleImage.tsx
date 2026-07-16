interface Props {
  url: string
  name?: string
  cropX?: number | null
  cropY?: number | null
  cropScale?: number | null
  className?: string
}

export function ArtistCircleImage({ url, name, cropX, cropY, cropScale, className = '' }: Props) {
  const x = cropX ?? 50
  const y = cropY ?? 50
  const scale = cropScale ?? 1

  return (
    <div
      className={`rounded-full ${className}`}
      role="img"
      aria-label={name}
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: `${scale * 100}%`,
        backgroundPosition: `${x}% ${y}%`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}
