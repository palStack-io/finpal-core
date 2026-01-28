#!/usr/bin/env python3
"""Test currency setup and exchange rate updates"""
from src.models.currency import Currency
from src.services.currency.service import CurrencyService
from src.extensions import db
from app import create_app

app = create_app()
with app.app_context():
    print("\n===== Current Currencies in Database =====")
    currencies = Currency.query.all()
    print(f"Total: {len(currencies)} currencies\n")

    for curr in currencies:
        base_indicator = " [BASE]" if curr.is_base else ""
        print(f"{curr.code:3} - {curr.name:25} {curr.symbol:5} Rate: {curr.rate_to_base:.6f}{base_indicator}")

    print("\n===== Testing Exchange Rate Update =====")
    currency_service = CurrencyService()
    updated_count = currency_service.update_exchange_rates()

    if updated_count > 0:
        print(f"✅ Successfully updated {updated_count} currencies")
        print("\n===== Updated Rates =====")
        currencies = Currency.query.filter(Currency.is_base == False).all()
        for curr in currencies:
            print(f"{curr.code}: {curr.rate_to_base:.6f} (updated: {curr.last_updated})")
    elif updated_count == 0:
        print("⚠️  No currencies were updated")
    else:
        print("❌ Exchange rate update failed")
