// SPDX-License-Identifier: GPL-3.0-only
// TmdbMetadataService.selectBestLocalizedImagePath; preserve useful addon artwork.
export function artworkURL(value) {
  try {const u=new URL(value);return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;}catch{return null;}
}
export function localizedLogo(images,language='pt-BR') {
  const [lang,region]=language.split('-');
  const rank=image=>image.iso_639_1===lang ? (image.iso_3166_1===region?0:!image.iso_3166_1?1:2) : image.iso_639_1==='en'?3:!image.iso_639_1?4:5;
  return (Array.isArray(images)?images:[]).filter(i=>typeof i?.file_path==='string' && /^\/[\w./-]+$/.test(i.file_path)).slice(0,200).sort((a,b)=>rank(a)-rank(b))[0]?.file_path || null;
}
export function enrichPlayerMetadata(meta,extra) {
  const logo=artworkURL(extra?.logo),previous=artworkURL(meta.logo);
  if(logo) {if(previous && previous!==logo)meta.fallbackLogo=previous;meta.logo=logo;}
  if(!meta.description && extra?.description)meta.description=extra.description;
  if(!meta.releaseInfo && extra?.releaseInfo)meta.releaseInfo=extra.releaseInfo;
  return meta;
}
