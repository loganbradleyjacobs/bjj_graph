'''
"Top Full Guard":{
        "distance": 1,
        "num_grips": 4,
        "control": 9.0,
        "path": "",
        "parents": ["Double Leg Takedown"],
        "children": ["Guillotine"],
        "area": ["Ground"],
        "type": ["Guard"],
        "sub_type": ["None"]
    }
'''
import pyperclip 

print("**BETA** Node properties are subject to change.")
name = input("Move Name: ")
distance = int(input("(int 0-10) distance from opponent: ") or "0")
control = float(input("(float 0-10) Control rating: ") or "0.00")
path = input("Path: ")

def get_list_input(prompt):
    print(prompt)
    list = []
    list_count = 0
    member = ""
    while member != 'q':
        list_count +=1
        member = input(f"Press q to quit. {prompt}: {list_count}. ")
        list.append(member)
    list.remove("q")
    return list

parents = get_list_input("Enter parents. ")
children = get_list_input("Enter children. ")
area = input("Enter area. ")
type = input("Enter type. ")
# subtype = get_list_input("Enter subtypes. ")

pyperclip.copy(
"\t,\n\"%s\":{\n \
    \t\t\"parents\": %s,\n \
    \t\t\"children\": %s,\n\
    \t\t\"area\": %s,\n \
    \t\t\"type\": %s,\n \
\t}"%(name,parents,children,area,type))




