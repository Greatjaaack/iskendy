export type PictureData = {
  sources: Record<string, string>;
  img: { src: string; w: number; h: number };
};
type Props = {
  image: PictureData;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};
/** Layout-neutral image primitive. Product assets and geometry remain Figma-owned. */
export function Picture({
  image,
  alt,
  sizes,
  priority = false,
  className,
}: Props) {
  return (
    <picture className={className}>
      {Object.entries(image.sources).map(([format, srcSet]) => (
        <source
          key={format}
          type={`image/${format === 'jpg' ? 'jpeg' : format}`}
          srcSet={srcSet}
          sizes={sizes}
        />
      ))}
      <img
        src={image.img.src}
        width={image.img.w}
        height={image.img.h}
        alt={alt}
        sizes={sizes}
        decoding="async"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
      />
    </picture>
  );
}
