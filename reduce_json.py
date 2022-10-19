import json
import argparse

ap = argparse.ArgumentParser()
ap.add_argument('f', type=str)
path = ap.parse_args().f

with open(path, 'r') as f:
	data = json.load(f)

keeplist = [
	[4, 41],
    [4, 40],
    [6, 13],
    [6, 72],
    [7, 65]
]

new_data = {}
for (k, l) in keeplist:
	if int(path.split('/')[-1].split('.')[0][1:]) != k:
		continue
	new_data[str(l)] = data[str(l)]

with open(path, 'w') as f:
	json.dump(new_data, f, indent=2)