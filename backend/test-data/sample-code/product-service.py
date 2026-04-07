"""
Sample Python Flask API for Testing
"""
from flask import Flask, request, jsonify
from functools import wraps
import jwt

app = Flask(__name__)

# Authentication decorator
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization')
        
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        try:
            # Decode JWT token
            decoded = jwt.decode(token, 'secret_key', algorithms=['HS256'])
            request.user = decoded
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function

# Product endpoints
@app.route('/products', methods=['GET'])
def get_products():
    """Get all products"""
    products = fetch_all_products()
    return jsonify(products)

@app.route('/products/<int:product_id>', methods=['GET'])
def get_product(product_id):
    """Get single product by ID"""
    product = fetch_product_by_id(product_id)
    
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    
    return jsonify(product)

@app.route('/products', methods=['POST'])
@require_auth
def create_product():
    """Create new product"""
    data = request.get_json()
    
    if not validate_product_data(data):
        return jsonify({'error': 'Invalid product data'}), 400
    
    product = save_product(data)
    return jsonify(product), 201

@app.route('/products/<int:product_id>', methods=['PUT'])
@require_auth
def update_product(product_id):
    """Update existing product"""
    data = request.get_json()
    
    product = fetch_product_by_id(product_id)
    if not product:
        return jsonify({'error': 'Product not found'}), 404
    
    updated = update_product_in_db(product_id, data)
    return jsonify(updated)

@app.route('/products/<int:product_id>', methods=['DELETE'])
@require_auth
def delete_product(product_id):
    """Delete product"""
    success = delete_product_from_db(product_id)
    
    if success:
        return '', 204
    else:
        return jsonify({'error': 'Product not found'}), 404

# Helper functions
def fetch_all_products():
    """Fetch all products from database"""
    return [
        {'id': 1, 'name': 'Product 1', 'price': 99.99},
        {'id': 2, 'name': 'Product 2', 'price': 149.99}
    ]

def fetch_product_by_id(product_id):
    """Fetch single product from database"""
    products = fetch_all_products()
    return next((p for p in products if p['id'] == product_id), None)

def validate_product_data(data):
    """Validate product data"""
    required_fields = ['name', 'price']
    return all(field in data for field in required_fields)

def save_product(data):
    """Save product to database"""
    # Simulate database insert
    product = {
        'id': 999,
        'name': data['name'],
        'price': data['price']
    }
    return product

def update_product_in_db(product_id, data):
    """Update product in database"""
    product = fetch_product_by_id(product_id)
    product.update(data)
    return product

def delete_product_from_db(product_id):
    """Delete product from database"""
    # Simulate database delete
    return True

def calculate_discount(price, discount_percent):
    """Calculate discounted price"""
    if discount_percent < 0 or discount_percent > 100:
        raise ValueError('Discount must be between 0 and 100')
    
    discount_amount = price * (discount_percent / 100)
    return price - discount_amount

if __name__ == '__main__':
    app.run(debug=True, port=5000)
