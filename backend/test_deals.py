import MetaTrader5 as mt5
import datetime

if not mt5.initialize():
    print("MT5 init failed")
    exit()

date_from = datetime.datetime.now() - datetime.timedelta(days=10)
date_to = datetime.datetime.now() + datetime.timedelta(days=1)
deals = mt5.history_deals_get(date_from, date_to)

if deals:
    for d in deals[-30:]:
        if d.entry == 1:
            print(f"Deal {d.ticket}: reason={getattr(d, 'reason', -1)} comment='{getattr(d, 'comment', '')}'")

orders = mt5.history_orders_get(date_from, date_to)
if orders:
    for o in orders[-30:]:
        print(f"Order {o.ticket}: reason={getattr(o, 'reason', -1)} comment='{getattr(o, 'comment', '')}'")

mt5.shutdown()
