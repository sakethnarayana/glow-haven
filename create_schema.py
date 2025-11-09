from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

# Environment setup
MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "beauty_db")

if not MONGO_URI:
    raise ValueError("❌ MONGO_URI not found in environment variables!")

# Connect to MongoDB Atlas (securely)
client = MongoClient(MONGO_URI, tls=True)
db = client.get_database(DB_NAME)

# Define schema templates (for structure reference)
collections = {
    "users": {
        "phone": "",
        "name": "",
        "role": "user"  # "user" | "admin"
    },
    "addresses": {
        "user_id": ObjectId(),
        "label": "",
        "recipient_name": "",
        "phone": "",
        "address_line": "",
        "landmark": "",
        "pincode": "",
        "city": "",
        "state": "",
        "is_default": False
    },
    "products": {
        "name": "",
        "description": "",
        "price": 0.0,
        "image": "",
        "category": "",
        "stock": 0
    },
    "orders": {
        "user_id": ObjectId(),
        "address_id": ObjectId(),
        "items": [],
        "total_amount": 0.0,
        "status": "pending"  # pending | confirmed | delivered | cancelled
    },
    "services": {
        "name": "",
        "description": "",
        "price": 0.0,
        "duration": "",
        "image": ""
    },
    "bookings": {
        "user_id": ObjectId(),
        "service_id": ObjectId(),
        "service_name": "",
        "service_price": 0.0,
        "service_duration": "",
        "date": "",
        "time": "",
        "name": "",
        "phone": "",
        "status": "pending"  # pending | confirmed | completed | cancelled
    },
    "availability": {
        "date": "",
        "unavailable_slots": []
    }
}

# Create collections if not present
existing = db.list_collection_names()

for name, schema in collections.items():
    if name not in existing:
        # Insert and delete a dummy document to ensure collection creation
        temp_id = db[name].insert_one(schema).inserted_id
        db[name].delete_one({"_id": temp_id})
        print(f"✅ Created collection: {name}")
    else:
        print(f"⚙️ Collection already exists: {name}")

# Create useful indexes
print("\n⚙️ Creating indexes...")
db.users.create_index("phone", unique=True)
db.addresses.create_index("user_id")
db.orders.create_index("user_id")
db.bookings.create_index("user_id")
db.bookings.create_index([("date", 1), ("time", 1)])
db.products.create_index("category")
db.services.create_index("name")
print("✅ Indexes created successfully!")

print("\n🎉 MongoDB schema setup complete!")
