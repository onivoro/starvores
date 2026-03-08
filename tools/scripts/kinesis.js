const { randomUUID } = require('crypto');
const AWS = require('aws-sdk');

AWS.config.update({ region: 'us-east-2' });

const limit = 10;

const kinesis = new AWS.Kinesis();

const writeToKinesis = async () => {
    const data = {
        source: 'macbookpro',
        type: 'test',
        data: {
            this: 'entire structure under the "data" property',
            can: 'be',
            absolutely: 'anything!!!',
            fiesta: `at ${Date.now()}`
        }
    };

    const params = {
        Data: JSON.stringify(data),
        PartitionKey: 'partition-key-123',
        StreamName: 'ivinesis-stream'
    };

    let i = 0;

    while (i < limit) {

        try {
            const result = await kinesis.putRecord(params).promise();
            console.log('Successfully sent data to Kinesis:', result);
        } catch (err) {
            console.error('Error sending data to Kinesis:', err);
        }

        i++;
    }
};

writeToKinesis();