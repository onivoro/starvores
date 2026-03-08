

const { saveFileAsJson } = require('@onivoro/server-common');
const { writeFile } = require('fs/promises');
const { Client } = require('pg');

const clientSource = new Client({
    connectionString: 'sensitive'
});

const clientTarget = new Client({
    connectionString: 'sensitive'
});

async function main() {
    try {
        await clientSource.connect();
        await clientTarget.connect();
        console.log('connected')
        await execQuery(clientSource);
    } catch(e) {
        console.log(e?.message);
    }
}

async function execQuery(client) {
    try {

        const table = process.argv[2];
        const query = `select * from "${table}"`;
        const output = await client.query(query);
        const name = `query-${table}`;
        await saveFileAsJson(`${name}`, output);
        const {rows, fields: all} = output;
        const fields = all.filter(f => !f.name.includes('_at'))
        const script = rows.map(row => `insert into "${table}" (${fields.map(f => `"${f.name}"`).join(',')}) values (${fields.map(f => `${fmt(f.name, row[f.name])}`).join(',')})`).join(';\n');
        // const script = rows.map(row => `update "${table}" set bom_id = '${row.bom_id}' where id = '${row.id}'`).join(';\n');
        await writeFile(`script-${table}`, script, {encoding: 'utf8'})



        console.log(`Database query executed successfully.`);

    } catch (error) {
        console.error('Error querying database:', error);

    } finally {
        await clientSource.end();
    }
}

function fmt (field, value) {
    // if(field === 'bom_id') {
    //     return 'null';
    // }
    return !value ? 'null' : `'${value}'`;
}

main().catch(e => console.log(e?.message)).then(() => console.log('done'))