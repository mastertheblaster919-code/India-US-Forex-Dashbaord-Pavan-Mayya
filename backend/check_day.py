from datetime import datetime
now = datetime.now()
print("Current date:", now.strftime("%Y-%m-%d %H:%M:%S"))
print("Weekday (0=Mon, 6=Sun):", now.weekday())
print("Is weekend:", now.weekday() >= 5)