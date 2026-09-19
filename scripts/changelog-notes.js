#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const raw = (process.argv[2] || require('../package.json').version).replace(/^v/i, '');
const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const escaped = raw.replace(/\./g, '\\.');
const start = changelog.search(new RegExp(`^## \\[${escaped}\\]`, 'm'));
if (start < 0) {
  process.stdout.write(`# eDIN+ Gateway Control ${raw}\n`);
  process.exit(0);
}
const fromHeading = changelog.slice(start);
const rest = fromHeading.slice(1);
const next = rest.search(/^## /m);
const section = (next >= 0 ? fromHeading.slice(0, next + 1) : fromHeading).trim();
process.stdout.write(section + '\n');
