import json
import os
import shutil

patterns = {
	4: [40, 41, 56],
	6: [0, 13, 72, 73],
	7: [62, 65, 90]
}

patterns = {
	4: [0],
	6: [5, 21, 29],
	8: [18, 57]
}

for k,v in patterns.items():
	path = os.path.join('patterns', f'p{k}.json')
	os.makedirs(os.path.join('public', 'patterns', f'figs_{k}'), exist_ok=True)
	new_path = os.path.join('public', 'patterns', f'p{k}_filtered.json')

	with open(path, 'r') as f:
		data = json.load(f)

	new_data = {}
	for ix in v:
		new_data[str(ix)] = data[str(ix)]
		png_path = os.path.join('patterns', f'figs_{k}', f'{k}_{ix}.png')
		new_png_path = os.path.join('public', 'patterns', f'figs_{k}', f'{k}_{ix}.png')
		shutil.copy(png_path, new_png_path)

	with open(new_path, 'w') as f:
		json.dump(new_data, f, indent=2)