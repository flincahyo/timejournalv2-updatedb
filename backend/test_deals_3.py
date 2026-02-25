import MetaTrader5 as mt5
import datetime

if mt5.initialize():
    pos_id = 2300403917
    deals = mt5.history_deals_get(position=pos_id)
    orders = mt5.history_orders_get(position=pos_id)
    if deals:
        for d in deals:
            print("Deal:", d.ticket, d.reason, d.comment, "entry:", d.entry)
    if orders:
        for o in orders:
            print("Order:", o.ticket, o.reason, o.comment, "type:", o.type)
    mt5.shutdown()
