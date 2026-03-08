const { chromium } = require('playwright');

const username = '';
const accountId = '';
const password = '';
const targetService = '';

(async () => {
    const browser = await chromium.launch({
        headless: false
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`https://${accountId}.signin.aws.amazon.com/console`);
    await page.getByLabel('IAM username').click();
    await page.getByLabel('IAM username').fill(username);
    await page.getByLabel('IAM username').press('Tab');
    await page.getByTestId('password').getByLabel('Password').click();
    await page.getByTestId('password').getByLabel('Password').fill(password);
    await page.getByTestId('sign-in').click();

    if (targetService) {
        await page.getByTestId('awsc-concierge-input').click();
        await page.getByTestId('awsc-concierge-input').fill(targetService);
    }

    // await context.close();
    // await browser.close();
})();