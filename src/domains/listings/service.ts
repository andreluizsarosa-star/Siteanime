import { publicImage, check } from "../../lib/core";
export function listingPhotos(photos: string[]) {
  check(
    photos.length >= 1 && photos.length <= 5,
    "Use entre uma e cinco fotos",
  );
  return photos.map(publicImage);
}
