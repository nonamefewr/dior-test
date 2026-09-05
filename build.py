#!/usr/bin/env python3
"""Build dior-platform.html from scratch"""

L = []
def w(s=""):
    L.append(s)

# ===== HEAD =====
w('<!DOCTYPE html>')
w('<html lang="vi">')
w('<head>')
w('<meta charset="utf-8">')
w('<meta name="viewport" content="width=device-width,initial-scale=1">')
w('<title>DIOR Platform</title>')
w('<link rel="preconnect" href="https://fonts.googleapis.com">')
w('<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">')
w('<style>')
w('*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}')
w(':root{')
w('  --black:#1a1a1a;--white:#ffffff;--off-white:#f7f7f7;--gray:#888888;--light-gray:#e5e5e5;')
w('  --gold:#c9a96e;--gld:#b8944f;--red:#e53935;--grn:#43a047;--blue:#1e88e5;')
w("  --font-serif:'Playfair Display',Georgia,'Times New Roman',serif;")
w("  --font-sans:'Inter',-apple-system,Helvetica Neue,Arial,sans-serif;")
w('  --header:56px;--bottomnav:68px;')
w('}')
w('html{scroll-behavior:smooth}')
w('body{font-family:var(--font-sans);color:var(--black);background:var(--off-white);min-height:100vh}')
w('a{color:inherit;text-decoration:none}')
w('button{cursor:pointer;font:inherit;border:none;background:none}')
print(f"Part 1 done: {len(L)} lines")

with open('/sessions/youthful-gracious-bell/mnt/dior/build.py', 'r') as f:
    pass
