content = open('/home/ubuntu/appointments_new.tsx').read()
with open('/home/ubuntu/barberagent/client/src/pages/Appointments.tsx', 'w') as f:
    f.write(content)
print("OK")
