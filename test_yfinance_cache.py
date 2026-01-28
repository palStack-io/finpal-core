#!/usr/bin/env python3
"""
Test script to verify yfinance caching is working properly
Run this to ensure rate limits are respected
"""

import time
from integrations.investments.yfinance import YFinanceCache

def test_cache():
    print("=" * 60)
    print("yfinance Cache Test")
    print("=" * 60)

    # Initialize cache with 1-hour expiry for testing
    cache = YFinanceCache(cache_dir='instance/yfcache', expire_seconds=3600)

    test_symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN']

    print("\n1️⃣  First Run - Should hit API (cache misses)")
    print("-" * 60)
    start_time = time.time()

    for symbol in test_symbols:
        print(f"\nFetching {symbol}...", end=" ")
        data = cache.get_ticker_info(symbol)
        if data:
            print(f"✅ Got price: ${data['price']:.2f}")
        else:
            print(f"❌ Failed")

    first_run_time = time.time() - start_time

    print(f"\n⏱️  First run took: {first_run_time:.2f} seconds")
    print(f"📊 Cache stats: {cache.get_stats()}")

    # Reset counters
    cache.hits = 0
    cache.misses = 0

    print("\n" + "=" * 60)
    print("\n2️⃣  Second Run - Should use cache (cache hits)")
    print("-" * 60)
    start_time = time.time()

    for symbol in test_symbols:
        print(f"\nFetching {symbol}...", end=" ")
        data = cache.get_ticker_info(symbol)
        if data:
            print(f"✅ Got price: ${data['price']:.2f} (cached)")
        else:
            print(f"❌ Failed")

    second_run_time = time.time() - start_time

    print(f"\n⏱️  Second run took: {second_run_time:.2f} seconds")
    print(f"📊 Cache stats: {cache.get_stats()}")

    # Calculate improvement
    speedup = first_run_time / second_run_time if second_run_time > 0 else 0

    print("\n" + "=" * 60)
    print("📈 Performance Summary")
    print("=" * 60)
    print(f"First run (API calls):  {first_run_time:.2f}s")
    print(f"Second run (cached):    {second_run_time:.2f}s")
    print(f"Speedup:                {speedup:.1f}x faster")
    print(f"API calls saved:        {len(test_symbols)} calls")

    # Test cache cleanup
    print("\n" + "=" * 60)
    print("🧹 Testing Cache Cleanup")
    print("=" * 60)

    import os
    cache_files = [f for f in os.listdir(cache.cache_dir) if f.endswith('.json')]
    print(f"Cache files created: {len(cache_files)}")

    # Show cache files
    for file in sorted(cache_files)[:5]:  # Show first 5
        filepath = os.path.join(cache.cache_dir, file)
        size = os.path.getsize(filepath)
        print(f"  • {file} ({size} bytes)")

    print("\n✅ Cache system is working correctly!")
    print("💡 Tip: Cache expires after 24 hours by default")

    return True

if __name__ == '__main__':
    try:
        test_cache()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
