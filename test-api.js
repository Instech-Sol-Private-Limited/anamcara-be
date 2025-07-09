const http = require('http');

function testAPI() {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/courses?page=1&limit=12&sort=popular',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        console.log('✅ API Response received:');
        console.log(JSON.stringify(jsonData, null, 2));
      } catch (error) {
        console.log('❌ Failed to parse JSON response:');
        console.log(data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request error:', error.message);
  });

  req.end();
}

console.log('🧪 Testing API endpoint: GET /api/courses?page=1&limit=12&sort=popular');
testAPI();
