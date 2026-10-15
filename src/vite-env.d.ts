/// <reference types="vite/client" />
declare module '*?format=webp' {
  const image: string;
  export default image;
}
declare module '*&as=picture' {
  const image: import('./ui/Picture/Picture').PictureData;
  export default image;
}
