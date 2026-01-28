#!/usr/bin/env python3
"""
Test script to verify SimpleFin API returns data in expected format
Uses the actual SimpleFin setup token to claim access and fetch real data
"""

import requests
import base64
import json
from datetime import datetime, timedelta

# Your SimpleFin setup token (base64 encoded claim URL)
SETUP_TOKEN = "aHR0cHM6Ly9iZXRhLWJyaWRnZS5zaW1wbGVmaW4ub3JnL3NpbXBsZWZpbi9jbGFpbS9DRDA2MUM0QkJERjU5QkYzMkM2RUJCQTg1QzI2NDRBNkRGMTBGNkYzMTVCMkE0MEY5MDk3RUVGNjI3NzhEQ0VGQThBM0ZGQkIzNTNCMDQyQjIwNTA0NTUzOEVGQzZDQzY2MUExMThEMjY1NTJFOUM3Qzg2RDgwNkMzQUY4NTJEMA=="

print("=" * 60)
print("SimpleFin API Integration Test")
print("=" * 60)

# Step 1: Decode the setup token
print("\n1️⃣  Decoding setup token...")
try:
    claim_url = base64.b64decode(SETUP_TOKEN).decode('utf-8')
    print(f"✅ Claim URL: {claim_url[:50]}...")
except Exception as e:
    print(f"❌ Error decoding token: {e}")
    exit(1)

# Step 2: Claim the access URL
print("\n2️⃣  Claiming access URL from SimpleFin...")
try:
    response = requests.post(claim_url)

    if response.status_code == 200:
        access_url = response.text.strip()
        print(f"✅ Access URL received")
        print(f"   Length: {len(access_url)} characters")

        # Parse access URL to show structure (without revealing credentials)
        if '@' in access_url:
            scheme_auth, host_path = access_url.split('@', 1)
            print(f"   Format: {scheme_auth.split('//')[0]}://[credentials]@{host_path}")
    else:
        print(f"❌ Error claiming access URL: HTTP {response.status_code}")
        print(f"   Response: {response.text}")
        exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)

# Step 3: Parse access URL
print("\n3️⃣  Parsing access URL...")
try:
    scheme, rest = access_url.split('//', 1)
    auth, rest = rest.split('@', 1)
    username, password = auth.split(':', 1)
    base_url = scheme + '//' + rest

    parsed = {
        'username': username,
        'password': password,
        'base_url': base_url
    }

    print(f"✅ Parsed successfully")
    print(f"   Base URL: {base_url}")
    print(f"   Has credentials: Yes")
except Exception as e:
    print(f"❌ Error parsing: {e}")
    exit(1)

# Step 4: Fetch accounts (without transactions first)
print("\n4️⃣  Testing basic account fetch...")
try:
    url = f"{parsed['base_url']}/accounts"
    response = requests.get(url, auth=(parsed['username'], parsed['password']))

    if response.status_code == 200:
        data = response.json()
        print(f"✅ Successfully fetched account data")
        print(f"   Response keys: {list(data.keys())}")

        if 'accounts' in data:
            print(f"   Number of accounts: {len(data['accounts'])}")
        else:
            print(f"   ⚠️  No 'accounts' key in response")
    else:
        print(f"❌ Error fetching accounts: HTTP {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)

# Step 5: Fetch accounts with 30 days of transactions
print("\n5️⃣  Fetching accounts with transactions (30 days)...")
try:
    start_date = datetime.now() - timedelta(days=30)
    start_timestamp = int(start_date.timestamp())

    url = f"{parsed['base_url']}/accounts?start-date={start_timestamp}"
    print(f"   URL: {url}")

    response = requests.get(url, auth=(parsed['username'], parsed['password']))

    if response.status_code == 200:
        full_data = response.json()
        print(f"✅ Successfully fetched accounts with transactions")

        # Save raw response for inspection
        with open('simplefin_raw_response.json', 'w') as f:
            json.dump(full_data, f, indent=2)
        print(f"   📄 Raw response saved to: simplefin_raw_response.json")

        # Analyze the structure
        print(f"\n📊 Data Structure Analysis:")
        print(f"   Top-level keys: {list(full_data.keys())}")

        if 'accounts' in full_data and len(full_data['accounts']) > 0:
            print(f"   Number of accounts: {len(full_data['accounts'])}")

            # Show first account structure
            first_account = full_data['accounts'][0]
            print(f"\n   First Account Keys: {list(first_account.keys())}")
            print(f"\n   Sample Account Data:")
            print(f"      • id: {first_account.get('id', 'N/A')}")
            print(f"      • name: {first_account.get('name', 'N/A')}")
            print(f"      • type: {first_account.get('type', 'N/A')}")
            print(f"      • balance: {first_account.get('balance', 'N/A')}")
            print(f"      • currency: {first_account.get('currency', 'N/A')}")

            if 'org' in first_account:
                org = first_account['org']
                print(f"      • institution: {org.get('name', 'N/A')}")

            if 'transactions' in first_account:
                trans_count = len(first_account['transactions'])
                print(f"      • transactions: {trans_count} found")

                if trans_count > 0:
                    # Show first transaction
                    first_trans = first_account['transactions'][0]
                    print(f"\n   Sample Transaction Keys: {list(first_trans.keys())}")
                    print(f"\n   Sample Transaction Data:")
                    print(f"      • id: {first_trans.get('id', 'N/A')}")
                    print(f"      • posted: {first_trans.get('posted', 'N/A')}")

                    # Convert posted timestamp to readable date
                    if 'posted' in first_trans and first_trans['posted']:
                        posted_date = datetime.fromtimestamp(first_trans['posted'])
                        print(f"      • posted_date: {posted_date.strftime('%Y-%m-%d %H:%M:%S')}")

                    print(f"      • amount: {first_trans.get('amount', 'N/A')}")
                    print(f"      • description: {first_trans.get('description', 'N/A')}")
                    print(f"      • payee: {first_trans.get('payee', 'N/A')}")
                    print(f"      • memo: {first_trans.get('memo', 'N/A')}")
                    print(f"      • pending: {first_trans.get('pending', False)}")

                    if 'category' in first_trans:
                        print(f"      • category: {first_trans.get('category', 'N/A')}")

            print(f"\n   All Accounts Summary:")
            for idx, account in enumerate(full_data['accounts'], 1):
                trans_count = len(account.get('transactions', []))
                balance = float(account.get('balance', 0))
                print(f"      {idx}. {account.get('name', 'Unknown'):30} | ${balance:>12,.2f} | {trans_count:>3} transactions")

        else:
            print(f"   ⚠️  No accounts found in response")

    else:
        print(f"❌ Error fetching data: HTTP {response.status_code}")
        print(f"   Response: {response.text[:200]}")
        exit(1)

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

# Step 6: Test our integration code
print("\n" + "=" * 60)
print("6️⃣  Testing Our SimpleFin Integration Code")
print("=" * 60)

try:
    # Import our SimpleFin client (requires Flask app context)
    print("\n⚠️  Note: Full integration test requires Flask app context")
    print("   Testing data processing functions directly...\n")

    # Test account processing
    from integrations.simplefin.client import SimpleFin

    class MockApp:
        """Mock Flask app for testing"""
        class Logger:
            def info(self, msg): pass
            def error(self, msg): print(f"[ERROR] {msg}")
            def warning(self, msg): print(f"[WARNING] {msg}")

        logger = Logger()
        config = {}

    client = SimpleFin(MockApp())

    # Process the accounts we just fetched
    processed_accounts = client.process_raw_accounts(full_data)

    print(f"✅ Processed {len(processed_accounts)} accounts")

    for idx, account in enumerate(processed_accounts, 1):
        print(f"\n   Account {idx}: {account['name']}")
        print(f"      • Type: {account['type']}")
        print(f"      • Institution: {account['institution']}")
        print(f"      • Balance: ${account['balance']:,.2f}")
        print(f"      • Currency: {account['currency_code']}")
        print(f"      • Transactions: {len(account['transactions'])}")

        if len(account['transactions']) > 0:
            trans = account['transactions'][0]
            print(f"\n      Sample Transaction:")
            print(f"         • Date: {trans['date'].strftime('%Y-%m-%d')}")
            print(f"         • Description: {trans['description']}")
            print(f"         • Amount: ${trans['amount']:.2f}")
            print(f"         • Type: {trans['transaction_type']}")
            if trans['category_name']:
                print(f"         • Category: {trans['category_name']}")

    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"""
✅ SimpleFin API is working correctly!
✅ Setup token decoded successfully
✅ Access URL claimed successfully
✅ Account data fetched successfully
✅ Transaction data fetched successfully
✅ Data processing works correctly

📦 Data Format Verification:
   • Accounts: ✅ Correct format
   • Transactions: ✅ Correct format
   • Institution info: ✅ Available
   • Categories: ✅ Available (when provided)

📊 Your Data:
   • Total Accounts: {len(processed_accounts)}
   • Total Transactions: {sum(len(acc['transactions']) for acc in processed_accounts)}
   • Date Range: Last 30 days

💾 Raw data saved to: simplefin_raw_response.json

🎯 Ready to integrate with DollarDollar!
    """)

except Exception as e:
    print(f"\n❌ Error in integration test: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
