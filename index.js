const https = require("https");
const {from, forkJoin} = require("rxjs");
const Q = require("q");
const express = require("express");
const { map } = require("rxjs/operators");

const app = express();
const Step = require("step");

function upgradeToHttps(addr) {
  if (!addr) return addr;

  if (addr.startsWith('https://')) {
    return addr;
  } else if (addr.startsWith('http://')) {
    return addr.replace(/^http:\/\//i, 'https://'); // upgrade to https
  } else {
    return `https://${addr}`; //add https
  }
}

async function fetchTitle(address) {
  try {
    const response = await fetch(upgradeToHttps(address), {
      redirect: 'follow', // This handles redirects automatically
    });
    if (!response.ok) {
      return "NO RESPONSE";
    }
    const html = await response.text();
    const match = html.match(/<title>(.*?)<\/title>/i);
    const title = match ? match[1].trim() : "NO RESPONSE";
    return title
  } catch (error) {
      return "NO RESPONSE";
  }
}

function fetchTitleWithCallbacks(address, callback) {
  https.get(upgradeToHttps(address), (res) => {
    // Handle redirects
    if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
      try {
        //  Follow only one redirect
        return fetchTitleWithCallbacks(res.headers.location, callback);
      } catch (error) {
        return callback(null, "NO RESPONSE");
      }
    }
    if (res.statusCode != 200) {
      console.log(res.statusCode,'--->')
      return callback(null, "NO RESPONSE");
    }

    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const match = data.match(/<title>(.*?)<\/title>/i);
      callback(null, match ? match[1].trim() : "NO RESPONSE");
    });
  }).on("error", () => {
    callback(null, "NO RESPONSE");
  })
}

function renderHTML(results) {
  return `<!DOCTYPE html> <html> <head></head> <body> <h1>Following are the titles of given websites:</h1> <ul> ${results .map((r) => `<li>${r.address} - \"${r.title}\"</li>`) .join("\n")} </ul> </body> </html>`;
}

function handleWithQ(addresses, res) {
  Q.all(
    addresses.map((addr) => {
      return fetchTitle(addr).then((title) => {
        return { address: addr, title };
      });
    })
  ).then((results) => {
    res.end(renderHTML(results));
  })
  .catch((err) => {
    res.end("Error: " + err.message);
  });
}

function handleWithStep(addresses, res) {
  Step(
    function fetchAll() {
      const group = this.group();
      addresses.forEach((addr) => {
        fetchTitleWithCallbacks(addr, group());
      });
    },

    function collate(err, titles) {
      if (err) return res.end(err);
      const results = addresses.map((addr, i) => ({
        address: addr,
        title: titles[i],
      }));
      res.end(renderHTML(results));
    }
  );
}

function handleWithCallbacks(addresses, res){
  let results = []
  let completed = 0;
  addresses.forEach((address) => {
    fetchTitleWithCallbacks(address, (error, title) => {
      results.push({ address, title });
      completed++;
      // When all requests are done, send response
      if (completed === addresses.length) {
        res.end(renderHTML(results));
      }
    });
  });
}

function handleWithRxJS(addresses, res) {
  forkJoin(
    addresses.map(addr =>
      from(fetchTitle(addr)).pipe(
        map(title => ({ address: addr, title }))
      )
    )
  ).subscribe({
    next: results => res.end(renderHTML(results)),
    error: err => res.end("Error: " + err.message)
  });
}

app.get("/I/want/title", async (req, res) => {
  const addresses = Array.isArray(req.query.address) ? req.query.address : [req.query.address]

  // (task 1) with callbacks
  // handleWithCallbacks(addresses, res)

  // (task 2) with step library
  // handleWithStep(addresses, res)

  //  (task 3) with promises
  // handleWithQ(addresses, res)

  // bonus (part with streams)
  handleWithRxJS(addresses, res)
});

app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(3000, () => console.log("Server running at http://localhost:3000"));
