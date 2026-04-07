// Bad Code Example - For Testing Error Detection
const express = require('express');
const app = express();

// PROBLEM: No error handling, too complex, poor naming
function processData(d, t, f, x) {
  let result = 0;
  for(let i = 0; i < d.length; i++) {
    if(t === 'sum') {
      result += d[i];
      if(f) {
        result = result * 2;
        if(x > 10) {
          result = result / x;
          if(result > 100) {
            result = 100;
          } else {
            if(result < 0) {
              result = 0;
            }
          }
        }
      }
    } else if(t === 'avg') {
      result += d[i];
      if(i === d.length - 1) {
        result = result / d.length;
      }
    } else if(t === 'max') {
      if(d[i] > result) {
        result = d[i];
      }
    }
  }
  return result;
}

// PROBLEM: No authentication, no validation
app.post('/admin/delete-all', (req, res) => {
  deleteAllData();
  res.send('Done');
});

// PROBLEM: SQL injection risk, no error handling
app.get('/search', (req, res) => {
  const query = `SELECT * FROM users WHERE name = '${req.query.name}'`;
  db.query(query, (err, results) => {
    res.json(results);
  });
});

// PROBLEM: Callback hell
app.get('/data', (req, res) => {
  getUser(req.query.id, (user) => {
    getOrders(user.id, (orders) => {
      getProducts(orders, (products) => {
        calculateTotal(products, (total) => {
          applyDiscount(total, (final) => {
            res.json({total: final});
          });
        });
      });
    });
  });
});

// PROBLEM: Orphan function - never called
function unusedFunction() {
  console.log('This function is never used');
  let x = 1;
  let y = 2;
  let z = x + y;
  return z;
}

// PROBLEM: Another orphan
function anotherOrphan() {
  return 'dead code';
}

app.listen(3000);
