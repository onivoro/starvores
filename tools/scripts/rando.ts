import { randomBytes } from 'crypto';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~';
const charactersLength = characters.length;

export function generateUniqueCode(length = 24) {
  let uniqueCode = '';

  const bytes = randomBytes(length);

  for (let i = 0; i < length; i++) {
    uniqueCode += characters.charAt(bytes[i] % charactersLength);
  }

  return uniqueCode;
}

console.log(generateUniqueCode(Number(process.argv[2]) || 16));