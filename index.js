const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');

const URL = 'https://www.glossier.com/collections/all';


const csvWriter = createObjectCsvWriter({
    path: 'glossier_products_variants.csv',
    header: [
        { id: 'product_name', title: 'product_name' },
        { id: 'variant_name', title: 'variant_name' },
        { id: 'price', title: 'price' },
        { id: 'url', title: 'url' },
        { id: 'scraped_at', title: 'scraped_at' }
    ],
    fieldDelimiter: ';',
    alwaysQuote: true
});

async function autoScroll(page) {
    let previousCount = 0;
    let noChangeCycles = 0;

    while (true) {
        const currentCount = await page.evaluate(() =>
            document.querySelectorAll('li.collection__item').length
        );

        console.log(`Items loaded: ${currentCount}`);

        if (currentCount === previousCount) {
            noChangeCycles++;
        } else {
            noChangeCycles = 0;
        }

        if (noChangeCycles >= 3) {
            console.log('No new items after multiple cycles. Stop.');
            break;
        }

        previousCount = currentCount;

        await page.evaluate(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
        await new Promise(r => setTimeout(r, 2500));

        await page.evaluate(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
        });
        await new Promise(r => setTimeout(r, 1500));

        await page.evaluate(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
        await new Promise(r => setTimeout(r, 2500));
    }
}

async function parsing() {
    console.log('Starting browser...');
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null
    });

    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Scrolling page to load all products...');
    await autoScroll(page);

    console.log('Extracting products and variants...');

    const productsData = await page.evaluate(() => {
        const items = document.querySelectorAll('li.js-collection-item');
        const cleanText = (el) => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;

        let extractedData = [];
        const scrapeTime = new Date().toISOString();

        items.forEach(item => {
            // Базовая информация о товаре
            const nameElement = item.querySelector('h3.js-product-title');
            const name = cleanText(nameElement) || 'Unknown Product';

            const linkElement = item.querySelector('a');
            const url = linkElement ? linkElement.href : null;

            const defaultPriceElement = item.querySelector('span.pi__price--current');
            const defaultPrice = cleanText(defaultPriceElement);

            const variantElements = item.querySelectorAll('li.js-option');

            if (variantElements.length > 0) {
                variantElements.forEach(v => {
                    const vName = v.getAttribute('data-variant-title') || v.getAttribute('data-option-value');

                    const vPrice = v.getAttribute('data-variant-price') || defaultPrice;

                    extractedData.push({
                        product_name: name,
                        variant_name: vName ? vName.trim() : 'Default Variant',
                        price: vPrice ? vPrice.trim() : defaultPrice,
                        url: url,
                        scraped_at: scrapeTime
                    });
                });
            } else {
                extractedData.push({
                    product_name: name,
                    variant_name: 'No variants',
                    price: defaultPrice,
                    url: url,
                    scraped_at: scrapeTime
                });
            }
        });

        const uniqueData = Array.from(new Set(extractedData.map(a => JSON.stringify(a))))
            .map(a => JSON.parse(a));

        return uniqueData;
    });

    console.log(`Total variants scraped: ${productsData.length}`);

    await csvWriter.writeRecords(productsData);
    console.log('CSV saved successfully as glossier_products_variants.csv');

    await browser.close();
    console.log('Done');
}

parsing();