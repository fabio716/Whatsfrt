#!/usr/bin/env python3
"""
Conversor de Contatos Google/WhatsApp para WhatsFRT
Arraste e solte arquivos CSV ou rode direto
"""
import csv
import re
import os
import sys
from pathlib import Path

def normalize_phone(phone):
    """Remove caracteres não numéricos e adiciona DDI 55 se necessário"""
    digits = re.sub(r'\D', '', phone)
    if not digits:
        return None
    
    # Já tem DDI 55
    if digits.startswith('55') and len(digits) in [12, 13]:
        return digits
    # Tem DDD mas não DDI
    elif len(digits) in [10, 11]:
        return f'55{digits}'
    # Muito curto
    elif len(digits) < 10:
        return None
    # Tenta usar como está
    else:
        return digits if len(digits) >= 10 else None

def convert_csv(input_file):
    """Converte CSV do Google Contacts para formato WhatsFRT (nome,telefone)"""
    input_path = Path(input_file)
    output_file = input_path.parent / f"{input_path.stem}_convertido.csv"
    
    print(f"\n📂 Processando: {input_path.name}")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f_in:
            reader = csv.DictReader(f_in)
            headers = reader.fieldnames or []
            
            contacts = []
            skipped = 0
            
            for row in reader:
                # Tenta pegar nome de várias formas
                name = None
                
                # Formato Google Contacts
                if 'First Name' in headers or 'Last Name' in headers:
                    name_parts = [
                        row.get('First Name', '').strip(),
                        row.get('Middle Name', '').strip(),
                        row.get('Last Name', '').strip(),
                    ]
                    name = ' '.join(p for p in name_parts if p)
                
                # Formato simples
                if not name:
                    for col in ['nome', 'name', 'Name', 'NOME', 'contato', 'cliente']:
                        if col in headers and row.get(col, '').strip():
                            name = row[col].strip()
                            break
                
                # Tenta pegar telefone de várias formas
                phone = None
                
                # Google Contacts (Phone 1-3 - Value)
                for i in range(1, 4):
                    phone_col = f'Phone {i} - Value'
                    if phone_col in headers:
                        phone_value = row.get(phone_col, '').strip()
                        if phone_value:
                            phone = normalize_phone(phone_value)
                            if phone:
                                break
                
                # Formato simples
                if not phone:
                    for col in ['telefone', 'phone', 'Phone', 'TELEFONE', 'celular', 'whatsapp', 'numero']:
                        if col in headers and row.get(col, '').strip():
                            phone = normalize_phone(row[col].strip())
                            if phone:
                                break
                
                if name and phone:
                    contacts.append({'nome': name, 'telefone': phone})
                else:
                    skipped += 1
        
        # Escreve CSV convertido
        with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
            writer = csv.DictWriter(f_out, fieldnames=['nome', 'telefone'])
            writer.writeheader()
            writer.writerows(contacts)
        
        print(f"✅ Convertidos: {len(contacts)} contatos")
        if skipped > 0:
            print(f"⚠️  Ignorados: {skipped} (sem nome ou telefone válido)")
        print(f"💾 Arquivo salvo: {output_file}")
        
        return str(output_file)
    
    except Exception as e:
        print(f"❌ Erro ao processar {input_file}: {e}")
        return None

def main():
    print("=" * 60)
    print("🔄 CONVERSOR DE CONTATOS - WhatsFRT")
    print("=" * 60)
    
    if len(sys.argv) > 1:
        # Arquivos passados como argumentos (drag & drop)
        files = sys.argv[1:]
    else:
        # Modo interativo
        print("\n📁 Arraste e solte os arquivos CSV aqui ou digite o caminho:")
        print("   (Pressione Enter sem digitar nada para sair)\n")
        
        files = []
        while True:
            file_input = input("Arquivo CSV: ").strip().strip('"').strip("'")
            if not file_input:
                break
            files.append(file_input)
    
    if not files:
        print("\n❌ Nenhum arquivo fornecido!")
        input("\nPressione Enter para sair...")
        return
    
    # Processa cada arquivo
    converted = []
    for file_path in files:
        if not os.path.exists(file_path):
            print(f"\n❌ Arquivo não encontrado: {file_path}")
            continue
        
        if not file_path.lower().endswith('.csv'):
            print(f"\n⚠️  Ignorado (não é CSV): {file_path}")
            continue
        
        result = convert_csv(file_path)
        if result:
            converted.append(result)
    
    # Resumo
    print("\n" + "=" * 60)
    if converted:
        print(f"✅ {len(converted)} arquivo(s) convertido(s) com sucesso!")
        print("\n📂 Arquivos gerados:")
        for f in converted:
            print(f"   • {f}")
    else:
        print("❌ Nenhum arquivo foi convertido")
    print("=" * 60)
    
    input("\nPressione Enter para sair...")

if __name__ == '__main__':
    main()
