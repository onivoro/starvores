const { execSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const name = 'csv.csv';
const rows = 3;

const referenceColumns = {
    email: (i) => 'email-' + i + '@blah.com',
    firstName: (i) => 'FirstName-' + i,
    lastName: (i) => 'LastName-' + i,
    lastFourSocial: (i) => '1234',
    dateOfBirth: (i) => `11/${i}/2000`,
    eligible: (i) => (i % 2) ? 'Yes' : 'No',
    externalId: (i) => 'generated-' + i,
};

const arr = Array(rows).fill();

const content = [
    ...arr.map((__, i) => Object.values(referenceColumns).map(_ => _(i + 1)).join(', '))
].join('\n');

writeFileSync(name, content, { encoding: 'utf-8' });
execSync(`mv ${name} ~/Downloads/`);
