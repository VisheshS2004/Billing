const map = new Map();
map.set('पंजाबी तड़का', 'पंजाबी');

const s = "पंजाबी तड़का 5×5";
let result = s;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const [key, fullName] of map.entries()) {
  const escaped = escapeRegExp(key);
  const re = new RegExp(`(^|(?<=[\\s,./×]))${escaped}(?=[\\s,./×]|$)`, 'gi');
  if (re.test(result)) {
    result = result.replace(re, fullName);
  } else {
    console.log("Did not match!", result, re);
  }
}

console.log("Result:", result);
