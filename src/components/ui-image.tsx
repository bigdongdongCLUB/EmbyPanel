"use client";

import Image, { type ImageLoader } from "next/image";
import type { ImgHTMLAttributes } from "react";

type UiImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "width" | "height"> & {
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

const passthroughLoader: ImageLoader = ({ src }) => src;

export function UiImage({ src, alt, width, height, loading, ...rest }: UiImageProps) {
  const safeWidth = typeof width === "number" && width > 0 ? width : 64;
  const safeHeight = typeof height === "number" && height > 0 ? height : 64;

  return (
    <Image
      {...rest}
      loader={passthroughLoader}
      unoptimized
      src={src}
      alt={alt}
      width={safeWidth}
      height={safeHeight}
      loading={loading}
    />
  );
}
