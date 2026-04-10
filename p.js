const puppeteer = require('puppeteer');
const { createObjectCsvWriter } = require('csv-writer');

const URL = 'https://www.glossier.com/collections/all';


const csvWriter = createObjectCsvWriter({
    path: 'output.csv',
    header: [
        { id: 'product_name', title: 'PRODUCT_NAME' },
        { id: 'product_id', title: 'PRODUCT_ID' },
        { id: 'image', title: 'IMAGES_LIST' },
        { id: 'url', title: 'PRODUCT_URL' },
        { id: 'price', title: 'PRICE' },
        { id: 'description', title: 'DESCRIPTION' },
        { id: 'scraped_at', title: 'SCRAPED_DATE' },
    ],
    fieldDelimiter: ';',
    alwaysQuote: true
});



async function parcsing() {

    const formattedProducts = products.map(product => {
        return {
            ...product,

            image: product.image ? `[${product.image}]` : '[]',

            price: product.price ? product.price.trim() : 'N/A'
        };
    });

    try {
        const BOM = '\uFEFF';
        if (!fs.existsSync('output.csv')) {
            fs.writeFileSync('output.csv', BOM);
        }

        await csvWriter.writeRecords(formattedProducts);
        console.log('CSV Norm');
    } catch (err) {
        console.error('ErrorCSV', err);
    }
}

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

async function scrapeProductData(browser, url) {
    const page = await browser.newPage();
    try {
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

        await page.waitForSelector('#description-item', { timeout: 15000 }).catch(() => null);

        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 1000));
        await page.evaluate(() => window.scrollBy(0, -500));


        await page.waitForSelector('img.pv-thumbs__image', { timeout: 10000 }).catch(() => {
            console.log(`Thumbnails not found on ${url}`);
        });


        const result = await page.evaluate(() => {
            //decr
            const descEl = document.querySelector('#description-item');
            if (descEl) descEl.style.maxHeight = 'none'; 
            const description = descEl ? descEl.innerText.replace(/\s+/g, ' ').trim() : null;


            const imgNodes = document.querySelectorAll('img.pv-thumbs__image');
            const urls = new Set();

            imgNodes.forEach(img => {
                let src = img.getAttribute('data-srcset') ||
                    img.getAttribute('srcset') ||
                    img.getAttribute('data-src') ||
                    img.src;

                if (src) {
                    let cleanUrl = src.split(',')[0].split(' ')[0].trim();

                    if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;

                    if (cleanUrl.includes('http')) {
                        urls.add(cleanUrl);
                    }
                }
            });

            return {
                description,
                images: Array.from(urls)
            };
        });

        console.log(`  Description: ${result.description ? result.description.slice(0, 40) + '...' : 'NOT FOUND'}`);
        console.log(`  Found ${result.images.length} images`);

        return result;

    } catch (err) {
        console.warn(`  Failed: ${url} → ${err.message}`);
        return { description: null, images: [] };
    } finally {
        await page.close();
    }
}

async function parcsing() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null
    });

    const page = await browser.newPage();
    // Change loction to US
    // await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US' });  

    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.waitForSelector('ul.collection__list');
    await autoScroll(page);

    const products = await page.evaluate(() => {
        const items = document.querySelectorAll('ul.collection__list li.js-collection-item');
        const cleanText = (el) => el ? el.innerText.replace(/\s+/g, ' ').trim() : null;

        return Array.from(items).map(item => {
            const name = cleanText(item.querySelector('h3.js-product-title'));
            const price = cleanText(item.querySelector('span.pi__price--current'));
            const linkElement = item.querySelector('a');
            const url = linkElement ? linkElement.href : null;
            const productId = item.querySelector('article')?.getAttribute('data-product-id') || null;

            // Save pic
            const catalogImages = Array.from(item.querySelectorAll('img'))
                .map(img => img.src)
                .filter(Boolean);

            return {
                product_name: name,
                product_id: productId,
                image: catalogImages || null, // Update while get describtion
                url: url,
                price: price,
                description: null,
                scraped_at: new Date().toISOString()
            };
        });
    });

    console.log(`Totaal scrapeead: ${products.length}`);

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        if (!product.url) continue;

        console.log(`[${i + 1}/${products.length}] Fetchieng from: ${product.url}`);

        const pageData = await scrapeProductData(browser, product.url);

        product.description = pageData.description;

        if (pageData.images && pageData.images.length > 0) {
            product.image = pageData.images.join(', ');
        } else if (Array.isArray(product.image)) {
            product.image = product.image.join(', ');
        }

        await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }

    await browser.close();
    await csvWriter.writeRecords(products);
    console.log('canseled');
}

parcsing();