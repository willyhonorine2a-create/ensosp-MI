export async function validatePhoto(file) {
 if(!file || file.size===0 || file.size>5*1024*1024) throw Error('Choisissez une photo de moins de 5 Mo.');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const format=bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? 'jpg' :
  [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) ? 'png' :
  String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP' ? 'webp' : '';
 const mime={jpg:'image/jpeg',png:'image/png',webp:'image/webp'}[format];
 if(!format || file.type!==mime) throw Error('Formats acceptés : JPEG, PNG et WebP uniquement.');
 return format;
}
