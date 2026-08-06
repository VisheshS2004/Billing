const str1 = "तड़का"; // typed with one layout
const str2 = "तड़का"; // typed with another layout

console.log("str1:", str1, str1.length);
console.log("str2:", str2, str2.length);
console.log("Equal?", str1 === str2);
console.log("NFC Equal?", str1.normalize('NFC') === str2.normalize('NFC'));
