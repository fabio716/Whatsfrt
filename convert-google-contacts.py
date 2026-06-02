#!/usr/bin/env python3
"""
Converte CSV do Google Contacts para formato simples (nome,telefone)
Uso: python convert-google-contacts.py contacts.csv
"""
import csv
import sys
import re

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
    else:
        return None

def convert_csv(input_file):
    output_file = input_file.replace('.csv', '_converted.csv')
    
    with open(input_file, 'r', encoding='utf-8') as f_in:
        reader = csv.DictReader(f_in)
        
        contacts = []
        for row in reader:
            # Combina First + Middle + Last Name
            name_parts = [
                row.get('First Name', '').strip(),
                row.get('Middle Name', '').strip(),
                row.get('Last Name', '').strip(),
            ]
            name = ' '.join(p for p in name_parts if p)
            
            # Pega primeiro telefone disponível
            phone = None
            for i in range(1, 4):
                phone_value = row.get(f'Phone {i} - Value', '').strip()
                if phone_value:
                    phone = normalize_phone(phone_value)
                    if phone:
                        break
            
            if name and phone:
                contacts.append({'nome': name, 'telefone': phone})
    
    # Escreve CSV convertido
    with open(output_file, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.DictWriter(f_out, fieldnames=['nome', 'telefone'])
        writer.writeheader()
        writer.writerows(contacts)
    
    print(f'✓ Convertido: {len(contacts)} contatos')
    print(f'✓ Arquivo salvo: {output_file}')
    return output_file

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('Uso: python convert-google-contacts.py contacts.csv')
        sys.exit(1)
    
    input_file = sys.argv[1]
    convert_csv(input_file)
