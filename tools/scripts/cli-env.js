#! /usr/bin/env node
const { readFileSync, writeFileSync } = require('fs');
const [node, program, file] = process.argv;

const encoding = 'utf-8';

if (!file) {
    console.log(`must pass file path`);
    return process.exit(1);
}

try {

    const raw = readFileSync(file, {encoding});

    console.log(file)

    const lines = raw.split('\n').filter(Boolean).map(l => l.trim()).filter(Boolean);

    const applicableLines = lines.filter(l => l.includes('=') && l[0] !== '#');

    const updatedLines = applicableLines.map(l => `export ${l}`);

    writeFileSync(`${file}-cli`, updatedLines.join('\n'), {encoding});

} catch (error) {
    console.log(error);
    return process.exit(1);
}
