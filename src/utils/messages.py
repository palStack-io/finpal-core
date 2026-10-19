"""Words the API says to a person when it could not do what they asked (voice rule 10: errors are ours, and kind).

The sentence is read on a phone, in a toast, in a form, by someone who may already be worried about money. It
says what happened and the next small step, never "Invalid", never an internal word (token, tenant, param).
"""

#: Any unexpected failure. Logged with the real cause on the server; never the cause itself to the person.
GENERIC_ERROR = 'Something went wrong on our side. Try again in a moment.'
