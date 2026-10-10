i

m

p

o

r

t

 

*

 

a

s

 

T

H

R

E

E

 

f

r

o

m

 

"

t

h

r

e

e

"

;

i

m

p

o

r

t

 

{

 

C

O

N

F

I

G

,

 

Q

U

A

L

I

T

Y

 

}

 

f

r

o

m

 

"

.

/

c

o

n

f

i

g

.

j

s

"

;

i

m

p

o

r

t

 

{

 

c

l

a

m

p

,

 

d

a

m

p

,

 

f

o

r

m

a

t

T

i

m

e

,

 

r

a

n

d

 

}

 

f

r

o

m

 

"

.

/

u

t

i

l

.

j

s

"

;

i

m

p

o

r

t

 

{

 

W

o

r

l

d

 

}

 

f

r

o

m

 

"

.

/

w

o

r

l

d

.

j

s

"

;

i

m

p

o

r

t

 

{

 

P

l

a

y

e

r

 

}

 

f

r

o

m

 

"

.

/

p

l

a

y

e

r

.

j

s

"

;

i

m

p

o

r

t

 

{

 

N

o

i

s

e

S

y

s

t

e

m

 

}

 

f

r

o

m

 

"

.

/

n

o

i

s

e

.

j

s

"

;

i

m

p

o

r

t

 

{

 

A

u

d

i

o

E

n

g

i

n

e

 

}

 

f

r

o

m

 

"

.

/

a

u

d

i

o

.

j

s

"

;

i

m

p

o

r

t

 

{

 

M

o

n

s

t

e

r

,

 

S

T

A

T

E

 

}

 

f

r

o

m

 

"

.

/

m

o

n

s

t

e

r

.

j

s

"

;

i

m

p

o

r

t

 

{

 

U

I

 

}

 

f

r

o

m

 

"

.

/

u

i

.

j

s

"

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

ㅼ

젙

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

s

e

t

t

i

n

g

s

 

=

 

O

b

j

e

c

t

.

a

s

s

i

g

n

(

 

 

{

 

s

e

n

s

i

t

i

v

i

t

y

:

 

1

,

 

i

n

v

e

r

t

Y

:

 

f

a

l

s

e

,

 

v

o

l

u

m

e

:

 

0

.

8

,

 

m

i

c

S

e

n

s

:

 

1

,

 

q

u

a

l

i

t

y

:

 

"

l

o

w

"

 

}

,

 

 

J

S

O

N

.

p

a

r

s

e

(

l

o

c

a

l

S

t

o

r

a

g

e

.

g

e

t

I

t

e

m

(

"

s

i

l

e

n

c

e

.

s

e

t

t

i

n

g

s

"

)

 

|

|

 

"

{

}

"

)

)

;

f

u

n

c

t

i

o

n

 

s

a

v

e

S

e

t

t

i

n

g

s

(

)

 

{

 

 

l

o

c

a

l

S

t

o

r

a

g

e

.

s

e

t

I

t

e

m

(

"

s

i

l

e

n

c

e

.

s

e

t

t

i

n

g

s

"

,

 

J

S

O

N

.

s

t

r

i

n

g

i

f

y

(

s

e

t

t

i

n

g

s

)

)

;

}

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

뚮

뜑

?

?

/

 

?

?

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

a

p

p

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

a

p

p

"

)

;

c

o

n

s

t

 

C

A

P

T

U

R

E

 

=

 

n

e

w

 

U

R

L

S

e

a

r

c

h

P

a

r

a

m

s

(

l

o

c

a

t

i

o

n

.

s

e

a

r

c

h

)

.

h

a

s

(

"

c

a

p

t

u

r

e

"

)

;

c

o

n

s

t

 

r

e

n

d

e

r

e

r

 

=

 

n

e

w

 

T

H

R

E

E

.

W

e

b

G

L

R

e

n

d

e

r

e

r

(

{

 

 

a

n

t

i

a

l

i

a

s

:

 

s

e

t

t

i

n

g

s

.

q

u

a

l

i

t

y

 

=

=

=

 

"

h

i

g

h

"

,

 

 

p

o

w

e

r

P

r

e

f

e

r

e

n

c

e

:

 

"

h

i

g

h

-

p

e

r

f

o

r

m

a

n

c

e

"

,

 

 

p

r

e

s

e

r

v

e

D

r

a

w

i

n

g

B

u

f

f

e

r

:

 

C

A

P

T

U

R

E

}

)

;

c

o

n

s

t

 

M

A

X

_

P

I

X

E

L

_

R

A

T

I

O

 

=

 

1

.

5

;

c

o

n

s

t

 

a

p

p

l

y

P

i

x

e

l

R

a

t

i

o

 

=

 

(

p

r

)

 

=

>

 

{

 

 

r

e

n

d

e

r

e

r

.

s

e

t

P

i

x

e

l

R

a

t

i

o

(

M

a

t

h

.

m

i

n

(

w

i

n

d

o

w

.

d

e

v

i

c

e

P

i

x

e

l

R

a

t

i

o

 

|

|

 

1

,

 

p

r

,

 

M

A

X

_

P

I

X

E

L

_

R

A

T

I

O

)

)

;

 

 

r

e

n

d

e

r

e

r

.

s

e

t

S

i

z

e

(

w

i

n

d

o

w

.

i

n

n

e

r

W

i

d

t

h

,

 

w

i

n

d

o

w

.

i

n

n

e

r

H

e

i

g

h

t

,

 

f

a

l

s

e

)

;

}

;

a

p

p

l

y

P

i

x

e

l

R

a

t

i

o

(

Q

U

A

L

I

T

Y

[

s

e

t

t

i

n

g

s

.

q

u

a

l

i

t

y

]

.

p

i

x

e

l

R

a

t

i

o

)

;

r

e

n

d

e

r

e

r

.

s

h

a

d

o

w

M

a

p

.

e

n

a

b

l

e

d

 

=

 

Q

U

A

L

I

T

Y

[

s

e

t

t

i

n

g

s

.

q

u

a

l

i

t

y

]

.

s

h

a

d

o

w

s

;

r

e

n

d

e

r

e

r

.

s

h

a

d

o

w

M

a

p

.

t

y

p

e

 

=

 

T

H

R

E

E

.

P

C

F

S

o

f

t

S

h

a

d

o

w

M

a

p

;

r

e

n

d

e

r

e

r

.

t

o

n

e

M

a

p

p

i

n

g

 

=

 

T

H

R

E

E

.

N

e

u

t

r

a

l

T

o

n

e

M

a

p

p

i

n

g

;

r

e

n

d

e

r

e

r

.

t

o

n

e

M

a

p

p

i

n

g

E

x

p

o

s

u

r

e

 

=

 

1

.

5

;

a

p

p

.

a

p

p

e

n

d

C

h

i

l

d

(

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

)

;

/

/

 

洹

몃

옒

?

?

而

⑦

뀓

?

ㅽ

듃

 

?

먯

떎

(

寃



?



 

?

붾

㈃

/

?

щ

옒

?

?

 

?



?

?

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

w

e

b

g

l

c

o

n

t

e

x

t

l

o

s

t

"

,

 

(

e

)

 

=

>

 

{

 

 

e

.

p

r

e

v

e

n

t

D

e

f

a

u

l

t

(

)

;

 

 

s

h

o

w

F

a

t

a

l

(

"

洹

몃

옒

?

?

而

⑦

뀓

?

ㅽ

듃

媛



 

?

먯

떎

?

섏

뿀

?

듬

땲

?

?

 

?

섏

씠

吏



瑜

?

?

덈

줈

怨

좎

묠

(

C

t

r

l

+

F

5

)

?

섎

㈃

 

蹂

듦

뎄

?

⑸

땲

?

?

"

)

;

}

,

 

f

a

l

s

e

)

;

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

w

e

b

g

l

c

o

n

t

e

x

t

r

e

s

t

o

r

e

d

"

,

 

(

)

 

=

>

 

{

 

 

a

p

p

l

y

P

i

x

e

l

R

a

t

i

o

(

1

.

0

)

;

 

 

i

f

 

(

w

o

r

l

d

)

 

w

o

r

l

d

.

s

e

t

S

h

a

d

o

w

s

(

f

a

l

s

e

)

;

 

 

r

e

n

d

e

r

e

r

.

s

h

a

d

o

w

M

a

p

.

e

n

a

b

l

e

d

 

=

 

f

a

l

s

e

;

}

,

 

f

a

l

s

e

)

;

/

/

 

寃



?



 

?

붾

㈃

 

?



?

?

?

ㅻ

쪟

瑜

?

蹂

댁

뿬

以



?

?

f

u

n

c

t

i

o

n

 

s

h

o

w

F

a

t

a

l

(

m

s

g

)

 

{

 

 

l

e

t

 

e

l

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

f

a

t

a

l

"

)

;

 

 

i

f

 

(

!

e

l

)

 

{

 

 

 

 

e

l

 

=

 

d

o

c

u

m

e

n

t

.

c

r

e

a

t

e

E

l

e

m

e

n

t

(

"

d

i

v

"

)

;

 

 

 

 

e

l

.

i

d

 

=

 

"

f

a

t

a

l

"

;

 

 

 

 

e

l

.

s

t

y

l

e

.

c

s

s

T

e

x

t

 

=

 

"

p

o

s

i

t

i

o

n

:

f

i

x

e

d

;

i

n

s

e

t

:

0

;

z

-

i

n

d

e

x

:

9

9

9

9

9

;

b

a

c

k

g

r

o

u

n

d

:

#

0

a

0

f

1

8

;

c

o

l

o

r

:

#

f

f

c

0

c

0

;

"

 

+

 

 

 

 

 

 

"

f

o

n

t

:

1

3

p

x

/

1

.

6

 

'

C

o

n

s

o

l

a

s

'

,

m

o

n

o

s

p

a

c

e

;

p

a

d

d

i

n

g

:

2

8

p

x

;

w

h

i

t

e

-

s

p

a

c

e

:

p

r

e

-

w

r

a

p

;

o

v

e

r

f

l

o

w

:

a

u

t

o

"

;

 

 

 

 

d

o

c

u

m

e

n

t

.

b

o

d

y

.

a

p

p

e

n

d

C

h

i

l

d

(

e

l

)

;

 

 

}

 

 

e

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

"

寃

뚯

엫

?

?

怨

꾩

냽

?

?

?

?

?

놁

뒿

?

덈

떎

.

\

n

\

n

"

 

+

 

m

s

g

 

+

 

"

\

n

\

n

?

섏

씠

吏



瑜

?

?

덈

줈

怨

좎

묠

(

C

t

r

l

+

F

5

)

?

?

二

쇱

꽭

?

?

"

;

}

w

i

n

d

o

w

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

e

r

r

o

r

"

,

 

(

e

)

 

=

>

 

s

h

o

w

F

a

t

a

l

(

(

e

.

m

e

s

s

a

g

e

 

|

|

 

"

?

ㅻ

쪟

"

)

 

+

 

"

\

n

"

 

+

 

(

e

.

f

i

l

e

n

a

m

e

 

|

|

 

"

"

)

 

+

 

"

:

"

 

+

 

(

e

.

l

i

n

e

n

o

 

|

|

 

"

"

)

)

)

;

w

i

n

d

o

w

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

u

n

h

a

n

d

l

e

d

r

e

j

e

c

t

i

o

n

"

,

 

(

e

)

 

=

>

 

s

h

o

w

F

a

t

a

l

(

"

"

 

+

 

(

(

e

.

r

e

a

s

o

n

 

&

&

 

e

.

r

e

a

s

o

n

.

m

e

s

s

a

g

e

)

 

|

|

 

e

.

r

e

a

s

o

n

 

|

|

 

"

?

?

?

?

?

녿

뒗

 

?

ㅻ

쪟

"

)

)

)

;

c

o

n

s

t

 

s

c

e

n

e

 

=

 

n

e

w

 

T

H

R

E

E

.

S

c

e

n

e

(

)

;

c

o

n

s

t

 

c

a

m

e

r

a

 

=

 

n

e

w

 

T

H

R

E

E

.

P

e

r

s

p

e

c

t

i

v

e

C

a

m

e

r

a

(

7

2

,

 

w

i

n

d

o

w

.

i

n

n

e

r

W

i

d

t

h

 

/

 

w

i

n

d

o

w

.

i

n

n

e

r

H

e

i

g

h

t

,

 

0

.

0

5

,

 

5

0

0

)

;

s

c

e

n

e

.

a

d

d

(

c

a

m

e

r

a

)

;

 

/

/

 

?

먯

쟾

?

?

S

p

o

t

L

i

g

h

t

)

?

?

移

대

찓

?

쇱

쓽

 

?

먯

떇

?

대

?

濡

?

?

ъ

뿉

 

?

ы

븿

?

섏

뼱

?

?

議

곕

챸

?

?

?

곸

슜

?

?

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

쒖

뒪

?

?

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

w

o

r

l

d

 

=

 

n

e

w

 

W

o

r

l

d

(

s

c

e

n

e

,

 

s

e

t

t

i

n

g

s

.

q

u

a

l

i

t

y

)

;

c

o

n

s

t

 

a

u

d

i

o

 

=

 

n

e

w

 

A

u

d

i

o

E

n

g

i

n

e

(

)

;

c

o

n

s

t

 

n

o

i

s

e

 

=

 

n

e

w

 

N

o

i

s

e

S

y

s

t

e

m

(

a

u

d

i

o

)

;

c

o

n

s

t

 

p

l

a

y

e

r

 

=

 

n

e

w

 

P

l

a

y

e

r

(

c

a

m

e

r

a

,

 

w

o

r

l

d

,

 

n

o

i

s

e

,

 

a

u

d

i

o

,

 

s

e

t

t

i

n

g

s

)

;

c

o

n

s

t

 

m

o

n

s

t

e

r

 

=

 

n

e

w

 

M

o

n

s

t

e

r

(

s

c

e

n

e

,

 

w

o

r

l

d

,

 

a

u

d

i

o

,

 

n

o

i

s

e

)

;

m

o

n

s

t

e

r

.

o

n

C

a

t

c

h

 

=

 

o

n

C

a

u

g

h

t

;

c

o

n

s

t

 

u

i

 

=

 

n

e

w

 

U

I

(

)

;

u

i

.

s

e

t

I

n

v

e

n

t

o

r

y

(

p

l

a

y

e

r

.

i

n

v

e

n

t

o

r

y

)

;

n

o

i

s

e

.

s

e

t

M

i

c

S

e

n

s

i

t

i

v

i

t

y

(

s

e

t

t

i

n

g

s

.

m

i

c

S

e

n

s

)

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

寃

뚯

엫

 

?

곹

깭

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

g

a

m

e

 

=

 

{

 

 

p

h

a

s

e

:

 

"

m

e

n

u

"

,

 

 

 

 

 

 

 

/

/

 

m

e

n

u

 

|

 

p

l

a

y

i

n

g

 

|

 

p

a

u

s

e

d

 

|

 

s

c

a

r

i

n

g

 

|

 

d

e

a

d

 

|

 

w

i

n

 

 

e

l

a

p

s

e

d

:

 

0

,

 

 

e

n

c

o

u

n

t

e

r

s

:

 

0

,

 

 

s

c

a

r

e

T

i

m

e

r

:

 

0

,

 

 

a

m

b

i

e

n

t

T

i

m

e

r

:

 

r

a

n

d

(

C

O

N

F

I

G

.

a

s

s

i

s

t

.

a

m

b

i

e

n

t

S

c

a

r

e

M

i

n

,

 

C

O

N

F

I

G

.

a

s

s

i

s

t

.

a

m

b

i

e

n

t

S

c

a

r

e

M

a

x

)

,

 

 

e

x

i

t

P

o

w

e

r

e

d

:

 

f

a

l

s

e

,

 

 

c

o

l

l

e

c

t

e

d

:

 

0

,

 

 

i

n

t

e

r

a

c

t

H

o

l

d

:

 

0

,

 

 

i

n

t

e

r

a

c

t

T

a

r

g

e

t

:

 

n

u

l

l

,

 

 

b

a

t

t

e

r

y

W

a

r

n

e

d

:

 

f

a

l

s

e

,

 

 

l

a

s

t

M

o

n

s

t

e

r

S

t

a

t

e

:

 

S

T

A

T

E

.

R

O

A

M

}

;

c

o

n

s

t

 

F

U

S

E

_

T

O

T

A

L

 

=

 

w

o

r

l

d

.

f

u

s

e

s

.

l

e

n

g

t

h

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

낅

젰

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

i

n

p

u

t

 

=

 

{

 

f

o

r

w

a

r

d

:

 

f

a

l

s

e

,

 

b

a

c

k

:

 

f

a

l

s

e

,

 

l

e

f

t

:

 

f

a

l

s

e

,

 

r

i

g

h

t

:

 

f

a

l

s

e

,

 

s

p

r

i

n

t

:

 

f

a

l

s

e

,

 

c

r

o

u

c

h

:

 

f

a

l

s

e

,

 

j

u

m

p

:

 

f

a

l

s

e

 

}

;

l

e

t

 

p

o

i

n

t

e

r

L

o

c

k

e

d

 

=

 

f

a

l

s

e

;

f

u

n

c

t

i

o

n

 

o

n

K

e

y

(

e

,

 

d

o

w

n

)

 

{

 

 

c

o

n

s

t

 

c

 

=

 

e

.

c

o

d

e

;

 

 

s

w

i

t

c

h

 

(

c

)

 

{

 

 

 

 

c

a

s

e

 

"

K

e

y

W

"

:

 

c

a

s

e

 

"

A

r

r

o

w

U

p

"

:

 

i

n

p

u

t

.

f

o

r

w

a

r

d

 

=

 

d

o

w

n

;

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

S

"

:

 

c

a

s

e

 

"

A

r

r

o

w

D

o

w

n

"

:

 

i

n

p

u

t

.

b

a

c

k

 

=

 

d

o

w

n

;

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

A

"

:

 

c

a

s

e

 

"

A

r

r

o

w

L

e

f

t

"

:

 

i

n

p

u

t

.

l

e

f

t

 

=

 

d

o

w

n

;

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

D

"

:

 

c

a

s

e

 

"

A

r

r

o

w

R

i

g

h

t

"

:

 

i

n

p

u

t

.

r

i

g

h

t

 

=

 

d

o

w

n

;

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

S

h

i

f

t

L

e

f

t

"

:

 

c

a

s

e

 

"

S

h

i

f

t

R

i

g

h

t

"

:

 

i

n

p

u

t

.

s

p

r

i

n

t

 

=

 

d

o

w

n

;

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

C

"

:

 

i

n

p

u

t

.

c

r

o

u

c

h

 

=

 

d

o

w

n

;

 

e

.

p

r

e

v

e

n

t

D

e

f

a

u

l

t

(

)

;

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

S

p

a

c

e

"

:

 

 

 

 

 

 

i

f

 

(

d

o

w

n

 

&

&

 

!

e

.

r

e

p

e

a

t

)

 

i

n

p

u

t

.

j

u

m

p

 

=

 

t

r

u

e

;

 

 

 

 

 

 

i

f

 

(

!

d

o

w

n

)

 

i

n

p

u

t

.

j

u

m

p

 

=

 

f

a

l

s

e

;

 

 

 

 

 

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

F

"

:

 

 

 

 

 

 

i

f

 

(

d

o

w

n

 

&

&

 

!

e

.

r

e

p

e

a

t

)

 

t

o

g

g

l

e

F

l

a

s

h

l

i

g

h

t

U

I

(

)

;

 

 

 

 

 

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

M

"

:

 

 

 

 

 

 

i

f

 

(

d

o

w

n

 

&

&

 

!

e

.

r

e

p

e

a

t

 

&

&

 

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

)

 

t

o

g

g

l

e

M

i

c

(

)

;

 

 

 

 

 

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

K

e

y

E

"

:

 

 

 

 

 

 

i

f

 

(

d

o

w

n

 

&

&

 

!

e

.

r

e

p

e

a

t

 

&

&

 

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

 

&

&

 

p

l

a

y

e

r

.

h

i

d

d

e

n

)

 

{

 

 

 

 

 

 

 

 

p

l

a

y

e

r

.

e

x

i

t

H

i

d

e

(

)

;

 

 

 

 

 

 

 

 

u

i

.

h

i

d

e

I

n

t

e

r

a

c

t

(

)

;

 

 

 

 

 

 

}

 

 

 

 

 

 

b

r

e

a

k

;

 

 

 

 

c

a

s

e

 

"

E

s

c

a

p

e

"

:

 

 

 

 

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

)

 

p

a

u

s

e

(

)

;

 

 

 

 

 

 

b

r

e

a

k

;

 

 

}

}

d

o

c

u

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

k

e

y

d

o

w

n

"

,

 

(

e

)

 

=

>

 

o

n

K

e

y

(

e

,

 

t

r

u

e

)

)

;

d

o

c

u

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

k

e

y

u

p

"

,

 

(

e

)

 

=

>

 

o

n

K

e

y

(

e

,

 

f

a

l

s

e

)

)

;

d

o

c

u

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

m

o

u

s

e

m

o

v

e

"

,

 

(

e

)

 

=

>

 

{

 

 

i

f

 

(

!

p

o

i

n

t

e

r

L

o

c

k

e

d

 

|

|

 

g

a

m

e

.

p

h

a

s

e

 

!

=

=

 

"

p

l

a

y

i

n

g

"

)

 

r

e

t

u

r

n

;

 

 

c

o

n

s

t

 

s

 

=

 

0

.

0

0

2

2

 

*

 

s

e

t

t

i

n

g

s

.

s

e

n

s

i

t

i

v

i

t

y

;

 

 

p

l

a

y

e

r

.

l

o

o

k

(

e

.

m

o

v

e

m

e

n

t

X

 

*

 

s

,

 

e

.

m

o

v

e

m

e

n

t

Y

 

*

 

s

)

;

}

)

;

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

l

i

c

k

"

,

 

(

)

 

=

>

 

{

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

 

&

&

 

!

p

o

i

n

t

e

r

L

o

c

k

e

d

)

 

l

o

c

k

P

o

i

n

t

e

r

(

)

;

}

)

;

/

/

 

留

덉

슦

?

?

?

쇱

そ

 

?

대

┃

?

쇰

줈

?

?

?

먯

쟾

?

깆

쓣

 

耳

쒓

퀬

 

?

덈

떎

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

m

o

u

s

e

d

o

w

n

"

,

 

(

e

)

 

=

>

 

{

 

 

i

f

 

(

e

.

b

u

t

t

o

n

 

=

=

=

 

0

 

&

&

 

p

o

i

n

t

e

r

L

o

c

k

e

d

)

 

t

o

g

g

l

e

F

l

a

s

h

l

i

g

h

t

U

I

(

)

;

}

)

;

f

u

n

c

t

i

o

n

 

t

o

g

g

l

e

F

l

a

s

h

l

i

g

h

t

U

I

(

)

 

{

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

!

=

=

 

"

p

l

a

y

i

n

g

"

)

 

r

e

t

u

r

n

;

 

 

p

l

a

y

e

r

.

t

o

g

g

l

e

F

l

a

s

h

l

i

g

h

t

(

)

;

 

 

u

i

.

s

e

t

F

l

a

s

h

l

i

g

h

t

(

p

l

a

y

e

r

.

f

l

a

s

h

O

n

)

;

}

f

u

n

c

t

i

o

n

 

l

o

c

k

P

o

i

n

t

e

r

(

)

 

{

 

 

c

o

n

s

t

 

e

l

 

=

 

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

;

 

 

i

f

 

(

e

l

.

r

e

q

u

e

s

t

P

o

i

n

t

e

r

L

o

c

k

)

 

e

l

.

r

e

q

u

e

s

t

P

o

i

n

t

e

r

L

o

c

k

(

)

;

}

f

u

n

c

t

i

o

n

 

u

n

l

o

c

k

P

o

i

n

t

e

r

(

)

 

{

 

 

i

f

 

(

d

o

c

u

m

e

n

t

.

e

x

i

t

P

o

i

n

t

e

r

L

o

c

k

)

 

d

o

c

u

m

e

n

t

.

e

x

i

t

P

o

i

n

t

e

r

L

o

c

k

(

)

;

}

d

o

c

u

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

p

o

i

n

t

e

r

l

o

c

k

c

h

a

n

g

e

"

,

 

(

)

 

=

>

 

{

 

 

p

o

i

n

t

e

r

L

o

c

k

e

d

 

=

 

d

o

c

u

m

e

n

t

.

p

o

i

n

t

e

r

L

o

c

k

E

l

e

m

e

n

t

 

=

=

=

 

r

e

n

d

e

r

e

r

.

d

o

m

E

l

e

m

e

n

t

;

 

 

i

f

 

(

!

p

o

i

n

t

e

r

L

o

c

k

e

d

 

&

&

 

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

)

 

p

a

u

s

e

(

)

;

}

)

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

쒖

옉

 

/

 

?

쇱

떆

?

뺤

?

 

/

 

?

щ

쭩

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

s

t

a

r

t

B

t

n

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

b

t

n

-

s

t

a

r

t

"

)

;

c

o

n

s

t

 

u

s

e

M

i

c

C

h

e

c

k

b

o

x

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

u

s

e

-

m

i

c

"

)

;

s

t

a

r

t

B

t

n

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

l

i

c

k

"

,

 

(

)

 

=

>

 

{

 

 

a

u

d

i

o

.

i

n

i

t

(

)

;

 

 

a

u

d

i

o

.

r

e

s

u

m

e

(

)

;

 

 

a

u

d

i

o

.

s

e

t

V

o

l

u

m

e

(

s

e

t

t

i

n

g

s

.

v

o

l

u

m

e

)

;

 

 

n

o

i

s

e

.

m

i

c

E

n

a

b

l

e

d

 

=

 

u

s

e

M

i

c

C

h

e

c

k

b

o

x

.

c

h

e

c

k

e

d

;

 

 

s

t

a

r

t

G

a

m

e

(

)

;

}

)

;

f

u

n

c

t

i

o

n

 

s

t

a

r

t

G

a

m

e

(

)

 

{

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

p

l

a

y

i

n

g

"

;

 

 

g

a

m

e

.

e

l

a

p

s

e

d

 

=

 

0

;

 

 

g

a

m

e

.

e

n

c

o

u

n

t

e

r

s

 

=

 

0

;

 

 

g

a

m

e

.

e

x

i

t

P

o

w

e

r

e

d

 

=

 

f

a

l

s

e

;

 

 

g

a

m

e

.

c

o

l

l

e

c

t

e

d

 

=

 

0

;

 

 

g

a

m

e

.

b

a

t

t

e

r

y

W

a

r

n

e

d

 

=

 

f

a

l

s

e

;

 

 

g

a

m

e

.

a

m

b

i

e

n

t

T

i

m

e

r

 

=

 

r

a

n

d

(

C

O

N

F

I

G

.

a

s

s

i

s

t

.

a

m

b

i

e

n

t

S

c

a

r

e

M

i

n

,

 

C

O

N

F

I

G

.

a

s

s

i

s

t

.

a

m

b

i

e

n

t

S

c

a

r

e

M

a

x

)

;

 

 

p

l

a

y

e

r

.

r

e

s

p

a

w

n

(

)

;

 

 

m

o

n

s

t

e

r

.

r

e

s

e

t

(

)

;

 

 

r

e

s

e

t

F

u

s

e

s

(

)

;

 

 

i

f

 

(

w

o

r

l

d

.

c

h

a

r

g

e

S

t

a

t

i

o

n

)

 

w

o

r

l

d

.

c

h

a

r

g

e

S

t

a

t

i

o

n

.

s

e

t

A

c

t

i

v

e

(

f

a

l

s

e

)

;

 

 

n

o

i

s

e

.

l

e

v

e

l

 

=

 

0

;

 

 

n

o

i

s

e

.

i

m

p

u

l

s

e

 

=

 

0

;

 

 

n

o

i

s

e

.

e

v

e

n

t

s

 

=

 

[

]

;

 

 

u

i

.

h

i

d

e

(

u

i

.

s

t

a

r

t

)

;

 

 

u

i

.

h

i

d

e

(

u

i

.

p

a

u

s

e

)

;

 

 

u

i

.

h

i

d

e

(

u

i

.

d

e

a

t

h

)

;

 

 

u

i

.

h

i

d

e

(

u

i

.

w

i

n

)

;

 

 

u

i

.

s

e

t

H

u

d

V

i

s

i

b

l

e

(

t

r

u

e

)

;

 

 

u

i

.

s

e

t

F

l

a

s

h

l

i

g

h

t

(

t

r

u

e

)

;

 

 

u

i

.

s

e

t

O

b

j

e

c

t

i

v

e

(

"

遺

꾩

쟾

湲

?

5

媛

쒕

?

 

李

얠

븘

 

?

꾩

썝

?

?

蹂

듦

뎄

?

섏

꽭

?

?

,

 

0

,

 

F

U

S

E

_

T

O

T

A

L

,

 

n

u

l

l

)

;

 

 

u

i

.

t

o

a

s

t

(

"

泥

?

랬

?

먭

?

 

?

덉

쓽

 

?

⑥

쓣

 

?

먭

펷

?

?

 

議

곗

슜

?

?

?



吏

곸

뿬

?

?

"

,

 

3

4

0

0

)

;

 

 

i

f

 

(

n

o

i

s

e

.

m

i

c

E

n

a

b

l

e

d

)

 

n

o

i

s

e

.

a

t

t

a

c

h

M

i

c

(

)

;

 

 

l

o

c

k

P

o

i

n

t

e

r

(

)

;

}

f

u

n

c

t

i

o

n

 

r

e

s

e

t

F

u

s

e

s

(

)

 

{

 

 

w

o

r

l

d

.

s

e

t

E

x

i

t

P

o

w

e

r

e

d

(

f

a

l

s

e

)

;

 

 

f

o

r

 

(

c

o

n

s

t

 

f

 

o

f

 

w

o

r

l

d

.

f

u

s

e

s

)

 

{

 

 

 

 

f

.

c

o

l

l

e

c

t

e

d

 

=

 

f

a

l

s

e

;

 

 

 

 

f

.

m

e

s

h

.

v

i

s

i

b

l

e

 

=

 

t

r

u

e

;

 

 

 

 

f

.

g

l

o

w

.

v

i

s

i

b

l

e

 

=

 

t

r

u

e

;

 

 

}

}

f

u

n

c

t

i

o

n

 

p

a

u

s

e

(

)

 

{

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

!

=

=

 

"

p

l

a

y

i

n

g

"

)

 

r

e

t

u

r

n

;

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

p

a

u

s

e

d

"

;

 

 

u

n

l

o

c

k

P

o

i

n

t

e

r

(

)

;

 

 

u

i

.

s

h

o

w

(

u

i

.

p

a

u

s

e

)

;

 

 

u

i

.

s

e

t

M

i

c

(

n

o

i

s

e

.

m

i

c

S

t

a

t

e

)

;

}

f

u

n

c

t

i

o

n

 

r

e

s

u

m

e

(

)

 

{

 

 

u

i

.

h

i

d

e

(

u

i

.

p

a

u

s

e

)

;

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

p

l

a

y

i

n

g

"

;

 

 

a

u

d

i

o

.

r

e

s

u

m

e

(

)

;

 

 

l

o

c

k

P

o

i

n

t

e

r

(

)

;

}

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

b

t

n

-

r

e

s

u

m

e

"

)

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

l

i

c

k

"

,

 

r

e

s

u

m

e

)

;

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

b

t

n

-

q

u

i

t

"

)

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

l

i

c

k

"

,

 

(

)

 

=

>

 

{

 

 

u

i

.

h

i

d

e

(

u

i

.

p

a

u

s

e

)

;

 

 

u

i

.

s

e

t

H

u

d

V

i

s

i

b

l

e

(

f

a

l

s

e

)

;

 

u

i

.

s

e

t

I

n

v

e

n

t

o

r

y

(

p

l

a

y

e

r

.

i

n

v

e

n

t

o

r

y

)

;

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

m

e

n

u

"

;

 

 

u

i

.

s

h

o

w

(

u

i

.

s

t

a

r

t

)

;

}

)

;

f

u

n

c

t

i

o

n

 

o

n

C

a

u

g

h

t

(

)

 

{

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

!

=

=

 

"

p

l

a

y

i

n

g

"

)

 

r

e

t

u

r

n

;

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

s

c

a

r

i

n

g

"

;

 

 

g

a

m

e

.

s

c

a

r

e

T

i

m

e

r

 

=

 

0

;

 

 

u

n

l

o

c

k

P

o

i

n

t

e

r

(

)

;

 

 

p

l

a

y

e

r

.

a

d

d

C

a

m

e

r

a

S

h

a

k

e

(

1

.

5

)

;

 

 

u

i

.

s

h

o

w

J

u

m

p

s

c

a

r

e

(

)

;

 

 

a

u

d

i

o

.

j

u

m

p

s

c

a

r

e

(

)

;

 

 

u

i

.

f

l

a

s

h

D

a

m

a

g

e

(

)

;

}

f

u

n

c

t

i

o

n

 

f

i

n

i

s

h

S

c

a

r

e

(

)

 

{

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

d

e

a

d

"

;

 

 

u

i

.

h

i

d

e

J

u

m

p

s

c

a

r

e

(

)

;

 

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

t

a

t

-

t

i

m

e

"

)

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

f

o

r

m

a

t

T

i

m

e

(

g

a

m

e

.

e

l

a

p

s

e

d

)

;

 

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

t

a

t

-

f

u

s

e

"

)

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

`

$

{

g

a

m

e

.

c

o

l

l

e

c

t

e

d

}

/

$

{

F

U

S

E

_

T

O

T

A

L

}

`

;

 

 

u

i

.

s

h

o

w

(

u

i

.

d

e

a

t

h

)

;

}

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

b

t

n

-

r

e

s

p

a

w

n

"

)

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

l

i

c

k

"

,

 

(

)

 

=

>

 

{

 

 

u

i

.

h

i

d

e

(

u

i

.

d

e

a

t

h

)

;

 

 

s

t

a

r

t

G

a

m

e

(

)

;

}

)

;

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

b

t

n

-

a

g

a

i

n

"

)

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

l

i

c

k

"

,

 

(

)

 

=

>

 

{

 

 

u

i

.

h

i

d

e

(

u

i

.

w

i

n

)

;

 

 

s

t

a

r

t

G

a

m

e

(

)

;

}

)

;

f

u

n

c

t

i

o

n

 

w

i

n

G

a

m

e

(

)

 

{

 

 

g

a

m

e

.

p

h

a

s

e

 

=

 

"

w

i

n

"

;

 

 

u

n

l

o

c

k

P

o

i

n

t

e

r

(

)

;

 

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

w

i

n

-

t

i

m

e

"

)

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

f

o

r

m

a

t

T

i

m

e

(

g

a

m

e

.

e

l

a

p

s

e

d

)

;

 

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

w

i

n

-

n

o

i

s

e

"

)

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

n

o

i

s

e

.

l

o

u

d

C

o

u

n

t

 

|

|

 

n

o

i

s

e

.

_

i

d

 

|

|

 

0

;

 

 

u

i

.

s

h

o

w

(

u

i

.

w

i

n

)

;

 

 

u

i

.

s

e

t

H

u

d

V

i

s

i

b

l

e

(

f

a

l

s

e

)

;

 

u

i

.

s

e

t

I

n

v

e

n

t

o

r

y

(

p

l

a

y

e

r

.

i

n

v

e

n

t

o

r

y

)

;

}

f

u

n

c

t

i

o

n

 

t

o

g

g

l

e

M

i

c

(

)

 

{

 

 

c

o

n

s

t

 

o

n

 

=

 

n

o

i

s

e

.

t

o

g

g

l

e

M

i

c

(

)

;

 

 

u

i

.

s

e

t

M

i

c

(

n

o

i

s

e

.

m

i

c

S

t

a

t

e

)

;

 

 

u

i

.

t

o

a

s

t

(

o

n

 

?

 

"

留

덉

씠

?

?

耳

쒖

쭚

 

?

?

紐

⑹

냼

由

ш

?

 

愿

대

Ъ

?

?

?

좎

씤

?

⑸

땲

?

?

 

:

 

"

留

덉

씠

?

?

爰

쇱

쭚

"

,

 

2

2

0

0

)

;

}

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

紐

⑺

몴

 

/

 

?

곹

샇

?

묒

슜

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

f

u

n

c

t

i

o

n

 

u

p

d

a

t

e

O

b

j

e

c

t

i

v

e

s

(

d

t

)

 

{

 

 

/

/

 

媛



?

?

媛



源

뚯

슫

 

?

⑥

쫰

 

 

l

e

t

 

n

e

a

r

e

s

t

 

=

 

n

u

l

l

,

 

n

d

 

=

 

I

n

f

i

n

i

t

y

;

 

 

f

o

r

 

(

c

o

n

s

t

 

f

 

o

f

 

w

o

r

l

d

.

f

u

s

e

s

)

 

{

 

 

 

 

i

f

 

(

f

.

c

o

l

l

e

c

t

e

d

)

 

c

o

n

t

i

n

u

e

;

 

 

 

 

c

o

n

s

t

 

d

 

=

 

M

a

t

h

.

h

y

p

o

t

(

f

.

x

 

-

 

p

l

a

y

e

r

.

x

,

 

f

.

z

 

-

 

p

l

a

y

e

r

.

z

)

;

 

 

 

 

i

f

 

(

d

 

<

 

n

d

)

 

{

 

n

d

 

=

 

d

;

 

n

e

a

r

e

s

t

 

=

 

f

;

 

}

 

 

}

 

 

/

/

 

?

곹

샇

?

묒

슜

 

?



?

?

?

먯

젙

 

 

l

e

t

 

t

a

r

g

e

t

 

=

 

n

u

l

l

;

 

 

l

e

t

 

l

a

b

e

l

 

=

 

"

"

;

 

 

/

/

 

?



?

좎

쿂

 

 

l

e

t

 

h

i

d

e

S

p

o

t

 

=

 

n

u

l

l

,

 

h

d

 

=

 

I

n

f

i

n

i

t

y

;

 

 

i

f

 

(

!

p

l

a

y

e

r

.

h

i

d

d

e

n

)

 

{

 

 

 

 

f

o

r

 

(

c

o

n

s

t

 

s

 

o

f

 

w

o

r

l

d

.

h

i

d

i

n

g

S

p

o

t

s

)

 

{

 

 

 

 

 

 

i

f

 

(

s

.

o

c

c

u

p

i

e

d

)

 

c

o

n

t

i

n

u

e

;

 

 

 

 

 

 

c

o

n

s

t

 

d

 

=

 

M

a

t

h

.

h

y

p

o

t

(

s

.

x

 

-

 

p

l

a

y

e

r

.

x

,

 

s

.

z

 

-

 

p

l

a

y

e

r

.

z

)

;

 

 

 

 

 

 

i

f

 

(

d

 

<

 

h

d

)

 

{

 

h

d

 

=

 

d

;

 

h

i

d

e

S

p

o

t

 

=

 

s

;

 

}

 

 

 

 

}

 

 

 

 

i

f

 

(

h

i

d

e

S

p

o

t

 

&

&

 

h

d

 

<

 

C

O

N

F

I

G

.

i

n

t

e

r

a

c

t

i

o

n

.

h

i

d

e

R

a

n

g

e

)

 

{

 

 

 

 

 

 

t

a

r

g

e

t

 

=

 

{

 

t

y

p

e

:

 

"

h

i

d

e

"

,

 

h

i

d

e

:

 

h

i

d

e

S

p

o

t

 

}

;

 

 

 

 

 

 

l

a

b

e

l

 

=

 

h

i

d

e

S

p

o

t

.

t

y

p

e

 

=

=

=

 

"

l

o

c

k

e

r

"

 

?

 

"

?

щ

Ъ

?

⑥

뿉

 

?

④

린

"

 

 

 

 

 

 

 

 

:

 

h

i

d

e

S

p

o

t

.

t

y

p

e

 

=

=

=

 

"

c

a

b

i

n

e

t

"

 

?

 

"

?

섎

궔

?

μ

뿉

 

?

④

린

"

 

 

 

 

 

 

 

 

:

 

h

i

d

e

S

p

o

t

.

t

y

p

e

 

=

=

=

 

"

d

e

s

k

"

 

?

 

"

梨

낆

긽

 

諛

묒

뿉

 

?

④

린

"

 

 

 

 

 

 

 

 

:

 

h

i

d

e

S

p

o

t

.

t

y

p

e

 

=

=

=

 

"

c

r

a

w

l

"

 

?

 

"

湲

곗

뼱

?

ㅼ

뼱

 

?

④

린

"

 

 

 

 

 

 

 

 

:

 

"

?

④

린

"

;

 

 

 

 

}

 

 

}

 

e

l

s

e

 

{

 

 

 

 

t

a

r

g

e

t

 

=

 

{

 

t

y

p

e

:

 

"

u

n

h

i

d

e

"

 

}

;

 

 

 

 

l

a

b

e

l

 

=

 

"

?

④

린

?

먯

꽌

 

?

섏

삤

湲

?

(

E

)

"

;

 

 

}

 

 

i

f

 

(

n

e

a

r

e

s

t

 

&

&

 

n

d

 

<

 

C

O

N

F

I

G

.

i

n

t

e

r

a

c

t

i

o

n

.

p

i

c

k

u

p

R

a

n

g

e

)

 

{

 

t

a

r

g

e

t

 

=

 

{

 

t

y

p

e

:

 

"

f

u

s

e

"

,

 

f

u

s

e

:

 

n

e

a

r

e

s

t

 

}

;

 

l

a

b

e

l

 

=

 

"

遺

꾩

쟾

湲

?

?

뚯

닔

"

;

 

}

 

 

c

o

n

s

t

 

g

d

 

=

 

M

a

t

h

.

h

y

p

o

t

(

w

o

r

l

d

.

e

x

i

t

.

x

 

-

 

p

l

a

y

e

r

.

x

,

 

w

o

r

l

d

.

e

x

i

t

.

z

 

-

 

p

l

a

y

e

r

.

z

)

;

 

 

i

f

 

(

g

a

m

e

.

e

x

i

t

P

o

w

e

r

e

d

 

&

&

 

g

d

 

<

 

C

O

N

F

I

G

.

i

n

t

e

r

a

c

t

i

o

n

.

g

a

t

e

R

a

n

g

e

)

 

{

 

t

a

r

g

e

t

 

=

 

{

 

t

y

p

e

:

 

"

g

a

t

e

"

 

}

;

 

l

a

b

e

l

 

=

 

"

泥

좊

Ц

 

?

닿

퀬

 

?

덉

텧

"

;

 

}

 

 

c

o

n

s

t

 

h

o

l

d

i

n

g

E

 

=

 

!

!

e

K

e

y

D

o

w

n

;

 

 

i

f

 

(

t

a

r

g

e

t

 

&

&

 

h

o

l

d

i

n

g

E

)

 

{

 

 

 

 

i

f

 

(

!

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

 

|

|

 

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

.

t

y

p

e

 

!

=

=

 

t

a

r

g

e

t

.

t

y

p

e

 

|

|

 

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

.

f

u

s

e

 

!

=

=

 

t

a

r

g

e

t

.

f

u

s

e

 

|

|

 

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

.

h

i

d

e

 

!

=

=

 

t

a

r

g

e

t

.

h

i

d

e

)

 

{

 

 

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

H

o

l

d

 

=

 

0

;

 

 

 

 

}

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

 

=

 

t

a

r

g

e

t

;

 

 

 

 

c

o

n

s

t

 

t

i

m

e

 

=

 

t

a

r

g

e

t

.

t

y

p

e

 

=

=

=

 

"

f

u

s

e

"

 

?

 

C

O

N

F

I

G

.

i

n

t

e

r

a

c

t

i

o

n

.

p

i

c

k

u

p

T

i

m

e

 

 

 

 

 

 

:

 

t

a

r

g

e

t

.

t

y

p

e

 

=

=

=

 

"

h

i

d

e

"

 

?

 

C

O

N

F

I

G

.

i

n

t

e

r

a

c

t

i

o

n

.

h

i

d

e

T

i

m

e

 

 

 

 

 

 

:

 

t

a

r

g

e

t

.

t

y

p

e

 

=

=

=

 

"

u

n

h

i

d

e

"

 

?

 

0

.

1

8

 

 

 

 

 

 

:

 

1

.

4

;

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

H

o

l

d

 

+

=

 

d

t

 

/

 

t

i

m

e

;

 

 

 

 

i

f

 

(

g

a

m

e

.

i

n

t

e

r

a

c

t

H

o

l

d

 

>

=

 

1

)

 

{

 

 

 

 

 

 

i

f

 

(

t

a

r

g

e

t

.

t

y

p

e

 

=

=

=

 

"

f

u

s

e

"

)

 

c

o

l

l

e

c

t

F

u

s

e

(

t

a

r

g

e

t

.

f

u

s

e

)

;

 

 

 

 

 

 

e

l

s

e

 

i

f

 

(

t

a

r

g

e

t

.

t

y

p

e

 

=

=

=

 

"

h

i

d

e

"

)

 

{

 

p

l

a

y

e

r

.

e

n

t

e

r

H

i

d

e

(

t

a

r

g

e

t

.

h

i

d

e

)

;

 

n

o

i

s

e

.

d

r

a

i

n

E

v

e

n

t

s

(

)

;

 

}

 

 

 

 

 

 

e

l

s

e

 

i

f

 

(

t

a

r

g

e

t

.

t

y

p

e

 

=

=

=

 

"

u

n

h

i

d

e

"

)

 

{

 

p

l

a

y

e

r

.

e

x

i

t

H

i

d

e

(

)

;

 

}

 

 

 

 

 

 

e

l

s

e

 

w

i

n

G

a

m

e

(

)

;

 

 

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

H

o

l

d

 

=

 

0

;

 

 

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

 

=

 

n

u

l

l

;

 

 

 

 

}

 

 

}

 

e

l

s

e

 

{

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

H

o

l

d

 

=

 

0

;

 

 

 

 

g

a

m

e

.

i

n

t

e

r

a

c

t

T

a

r

g

e

t

 

=

 

n

u

l

l

;

 

 

}

 

 

i

f

 

(

t

a

r

g

e

t

)

 

u

i

.

s

h

o

w

I

n

t

e

r

a

c

t

(

l

a

b

e

l

,

 

g

a

m

e

.

i

n

t

e

r

a

c

t

H

o

l

d

)

;

 

 

e

l

s

e

 

u

i

.

h

i

d

e

I

n

t

e

r

a

c

t

(

)

;

 

 

/

/

 

紐

⑺

몴

 

?

띿

뒪

?

?

 

 

i

f

 

(

g

a

m

e

.

e

x

i

t

P

o

w

e

r

e

d

)

 

{

 

 

 

 

u

i

.

s

e

t

O

b

j

e

c

t

i

v

e

(

"

寃

⑸

━

 

泥

좊

Ц

?

쇰

줈

 

?

덉

텧

?

섎

씪

"

,

 

g

a

m

e

.

c

o

l

l

e

c

t

e

d

,

 

F

U

S

E

_

T

O

T

A

L

,

 

n

u

l

l

)

;

 

 

}

 

e

l

s

e

 

{

 

 

 

 

u

i

.

s

e

t

O

b

j

e

c

t

i

v

e

(

"

遺

꾩

쟾

湲

?

5

媛

쒕

?

 

李

얠

븘

 

?

꾩

썝

?

?

蹂

듦

뎄

?

섏

꽭

?

?

,

 

g

a

m

e

.

c

o

l

l

e

c

t

e

d

,

 

F

U

S

E

_

T

O

T

A

L

,

 

n

e

a

r

e

s

t

 

?

 

n

d

 

:

 

n

u

l

l

)

;

 

 

}

}

f

u

n

c

t

i

o

n

 

c

o

l

l

e

c

t

F

u

s

e

(

f

)

 

{

 

 

f

.

c

o

l

l

e

c

t

e

d

 

=

 

t

r

u

e

;

 

 

f

.

m

e

s

h

.

v

i

s

i

b

l

e

 

=

 

f

a

l

s

e

;

 

 

f

.

g

l

o

w

.

v

i

s

i

b

l

e

 

=

 

f

a

l

s

e

;

 

 

g

a

m

e

.

c

o

l

l

e

c

t

e

d

+

+

;

 

 

a

u

d

i

o

.

b

l

i

p

(

1

0

4

0

,

 

0

.

1

6

)

;

 

 

n

o

i

s

e

.

a

d

d

I

m

p

u

l

s

e

(

0

.

2

,

 

p

l

a

y

e

r

.

x

,

 

p

l

a

y

e

r

.

z

,

 

"

p

i

c

k

u

p

"

)

;

 

 

i

f

 

(

g

a

m

e

.

c

o

l

l

e

c

t

e

d

 

>

=

 

F

U

S

E

_

T

O

T

A

L

)

 

{

 

 

 

 

g

a

m

e

.

e

x

i

t

P

o

w

e

r

e

d

 

=

 

t

r

u

e

;

 

 

 

 

w

o

r

l

d

.

s

e

t

E

x

i

t

P

o

w

e

r

e

d

(

t

r

u

e

)

;

 

 

 

 

u

i

.

t

o

a

s

t

(

"

전

원

 

복

구

 

—

 

격

리

 

철

문

의

 

잠

금

이

 

풀

렸

다

"

,

 

3

6

0

0

)

;

 

 

 

 

u

i

.

s

e

t

O

b

j

e

c

t

i

v

e

(

"

寃

⑸

━

 

泥

좊

Ц

?

쇰

줈

 

?

덉

텧

?

섎

씪

"

,

 

g

a

m

e

.

c

o

l

l

e

c

t

e

d

,

 

F

U

S

E

_

T

O

T

A

L

,

 

n

u

l

l

)

;

 

 

}

 

e

l

s

e

 

{

 

 

 

 

u

i

.

t

o

a

s

t

(

`

遺

꾩

쟾

湲

?

$

{

g

a

m

e

.

c

o

l

l

e

c

t

e

d

}

/

$

{

F

U

S

E

_

T

O

T

A

L

}

 

?

ш

린

?

?

,

 

1

6

0

0

)

;

 

 

}

}

l

e

t

 

e

K

e

y

D

o

w

n

 

=

 

f

a

l

s

e

;

d

o

c

u

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

k

e

y

d

o

w

n

"

,

 

(

e

)

 

=

>

 

{

 

i

f

 

(

e

.

c

o

d

e

 

=

=

=

 

"

K

e

y

E

"

)

 

e

K

e

y

D

o

w

n

 

=

 

t

r

u

e

;

 

}

)

;

d

o

c

u

m

e

n

t

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

k

e

y

u

p

"

,

 

(

e

)

 

=

>

 

{

 

i

f

 

(

e

.

c

o

d

e

 

=

=

=

 

"

K

e

y

E

"

)

 

e

K

e

y

D

o

w

n

 

=

 

f

a

l

s

e

;

 

}

)

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

섍

꼍

 

怨

듯

룷

 

?

곗

텧

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

s

h

a

d

o

w

T

e

x

 

=

 

m

a

k

e

S

h

a

d

o

w

F

i

g

u

r

e

(

)

;

f

u

n

c

t

i

o

n

 

t

r

i

g

g

e

r

A

m

b

i

e

n

t

S

c

a

r

e

(

)

 

{

 

 

c

o

n

s

t

 

r

o

l

l

 

=

 

M

a

t

h

.

r

a

n

d

o

m

(

)

;

 

 

i

f

 

(

r

o

l

l

 

<

 

0

.

4

)

 

{

 

 

 

 

a

u

d

i

o

.

s

c

r

e

e

c

h

(

0

.

3

5

)

;

 

 

 

 

a

u

d

i

o

.

g

r

o

w

l

(

0

.

3

,

 

r

a

n

d

(

-

1

,

 

1

)

,

 

0

.

4

)

;

 

 

}

 

e

l

s

e

 

i

f

 

(

r

o

l

l

 

<

 

0

.

7

)

 

{

 

 

 

 

a

u

d

i

o

.

l

a

n

d

(

0

.

3

)

;

 

 

 

 

a

u

d

i

o

.

b

r

e

a

t

h

e

(

0

.

3

5

,

 

r

a

n

d

(

-

1

,

 

1

)

)

;

 

 

}

 

e

l

s

e

 

{

 

 

 

 

f

l

a

s

h

S

h

a

d

o

w

F

i

g

u

r

e

(

)

;

 

 

}

 

 

p

l

a

y

e

r

.

a

d

d

C

a

m

e

r

a

S

h

a

k

e

(

0

.

0

8

)

;

}

l

e

t

 

s

h

a

d

o

w

S

p

r

i

t

e

 

=

 

n

u

l

l

,

 

s

h

a

d

o

w

T

i

m

e

r

 

=

 

0

;

f

u

n

c

t

i

o

n

 

f

l

a

s

h

S

h

a

d

o

w

F

i

g

u

r

e

(

)

 

{

 

 

i

f

 

(

s

h

a

d

o

w

S

p

r

i

t

e

)

 

r

e

t

u

r

n

;

 

 

c

o

n

s

t

 

d

i

r

 

=

 

p

l

a

y

e

r

.

y

a

w

 

+

 

r

a

n

d

(

-

0

.

9

,

 

0

.

9

)

;

 

 

c

o

n

s

t

 

d

i

s

t

 

=

 

r

a

n

d

(

9

,

 

1

6

)

;

 

 

c

o

n

s

t

 

x

 

=

 

p

l

a

y

e

r

.

x

 

+

 

M

a

t

h

.

s

i

n

(

d

i

r

)

 

*

 

d

i

s

t

;

 

 

c

o

n

s

t

 

z

 

=

 

p

l

a

y

e

r

.

z

 

+

 

M

a

t

h

.

c

o

s

(

d

i

r

)

 

*

 

d

i

s

t

;

 

 

c

o

n

s

t

 

y

 

=

 

w

o

r

l

d

.

h

e

i

g

h

t

A

t

(

x

,

 

z

)

 

+

 

1

.

6

;

 

 

s

h

a

d

o

w

S

p

r

i

t

e

 

=

 

n

e

w

 

T

H

R

E

E

.

S

p

r

i

t

e

(

n

e

w

 

T

H

R

E

E

.

S

p

r

i

t

e

M

a

t

e

r

i

a

l

(

{

 

m

a

p

:

 

s

h

a

d

o

w

T

e

x

,

 

t

r

a

n

s

p

a

r

e

n

t

:

 

t

r

u

e

,

 

d

e

p

t

h

W

r

i

t

e

:

 

f

a

l

s

e

,

 

o

p

a

c

i

t

y

:

 

0

.

9

2

 

}

)

)

;

 

 

s

h

a

d

o

w

S

p

r

i

t

e

.

s

c

a

l

e

.

s

e

t

(

1

.

6

,

 

3

.

0

,

 

1

)

;

 

 

s

h

a

d

o

w

S

p

r

i

t

e

.

p

o

s

i

t

i

o

n

.

s

e

t

(

x

,

 

y

,

 

z

)

;

 

 

s

c

e

n

e

.

a

d

d

(

s

h

a

d

o

w

S

p

r

i

t

e

)

;

 

 

s

h

a

d

o

w

T

i

m

e

r

 

=

 

0

.

3

4

;

 

 

a

u

d

i

o

.

s

c

r

e

e

c

h

(

0

.

5

)

;

}

f

u

n

c

t

i

o

n

 

m

a

k

e

S

h

a

d

o

w

F

i

g

u

r

e

(

)

 

{

 

 

c

o

n

s

t

 

c

 

=

 

d

o

c

u

m

e

n

t

.

c

r

e

a

t

e

E

l

e

m

e

n

t

(

"

c

a

n

v

a

s

"

)

;

 

 

c

.

w

i

d

t

h

 

=

 

1

2

8

;

 

c

.

h

e

i

g

h

t

 

=

 

2

5

6

;

 

 

c

o

n

s

t

 

c

t

x

 

=

 

c

.

g

e

t

C

o

n

t

e

x

t

(

"

2

d

"

)

;

 

 

c

t

x

.

c

l

e

a

r

R

e

c

t

(

0

,

 

0

,

 

1

2

8

,

 

2

5

6

)

;

 

 

c

t

x

.

f

i

l

l

S

t

y

l

e

 

=

 

"

#

0

0

0

"

;

 

 

/

/

 

癒

몃

━

 

 

c

t

x

.

b

e

g

i

n

P

a

t

h

(

)

;

 

c

t

x

.

a

r

c

(

6

4

,

 

4

0

,

 

2

2

,

 

0

,

 

M

a

t

h

.

P

I

 

*

 

2

)

;

 

c

t

x

.

f

i

l

l

(

)

;

 

 

/

/

 

紐

명

넻

 

 

c

t

x

.

b

e

g

i

n

P

a

t

h

(

)

;

 

 

c

t

x

.

m

o

v

e

T

o

(

4

8

,

 

5

8

)

;

 

c

t

x

.

l

i

n

e

T

o

(

8

0

,

 

5

8

)

;

 

c

t

x

.

l

i

n

e

T

o

(

9

2

,

 

1

5

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

3

6

,

 

1

5

0

)

;

 

c

t

x

.

c

l

o

s

e

P

a

t

h

(

)

;

 

c

t

x

.

f

i

l

l

(

)

;

 

 

/

/

 

?

?

 

 

c

t

x

.

b

e

g

i

n

P

a

t

h

(

)

;

 

c

t

x

.

m

o

v

e

T

o

(

4

8

,

 

6

2

)

;

 

c

t

x

.

l

i

n

e

T

o

(

3

0

,

 

1

5

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

4

0

,

 

1

5

4

)

;

 

c

t

x

.

l

i

n

e

T

o

(

5

6

,

 

7

0

)

;

 

c

t

x

.

c

l

o

s

e

P

a

t

h

(

)

;

 

c

t

x

.

f

i

l

l

(

)

;

 

 

c

t

x

.

b

e

g

i

n

P

a

t

h

(

)

;

 

c

t

x

.

m

o

v

e

T

o

(

8

0

,

 

6

2

)

;

 

c

t

x

.

l

i

n

e

T

o

(

9

8

,

 

1

5

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

8

8

,

 

1

5

4

)

;

 

c

t

x

.

l

i

n

e

T

o

(

7

2

,

 

7

0

)

;

 

c

t

x

.

c

l

o

s

e

P

a

t

h

(

)

;

 

c

t

x

.

f

i

l

l

(

)

;

 

 

/

/

 

?

ㅻ

━

 

 

c

t

x

.

b

e

g

i

n

P

a

t

h

(

)

;

 

c

t

x

.

m

o

v

e

T

o

(

4

6

,

 

1

5

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

5

8

,

 

2

4

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

4

8

,

 

2

4

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

3

8

,

 

1

5

2

)

;

 

c

t

x

.

c

l

o

s

e

P

a

t

h

(

)

;

 

c

t

x

.

f

i

l

l

(

)

;

 

 

c

t

x

.

b

e

g

i

n

P

a

t

h

(

)

;

 

c

t

x

.

m

o

v

e

T

o

(

8

2

,

 

1

5

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

9

0

,

 

2

4

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

8

0

,

 

2

4

0

)

;

 

c

t

x

.

l

i

n

e

T

o

(

7

0

,

 

1

5

2

)

;

 

c

t

x

.

c

l

o

s

e

P

a

t

h

(

)

;

 

c

t

x

.

f

i

l

l

(

)

;

 

 

c

o

n

s

t

 

t

e

x

 

=

 

n

e

w

 

T

H

R

E

E

.

C

a

n

v

a

s

T

e

x

t

u

r

e

(

c

)

;

 

 

t

e

x

.

c

o

l

o

r

S

p

a

c

e

 

=

 

T

H

R

E

E

.

S

R

G

B

C

o

l

o

r

S

p

a

c

e

;

 

 

r

e

t

u

r

n

 

t

e

x

;

}

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

硫

붿

씤

 

猷

⑦

봽

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

c

l

o

c

k

 

=

 

n

e

w

 

T

H

R

E

E

.

C

l

o

c

k

(

)

;

l

e

t

 

f

p

s

A

c

c

 

=

 

0

,

 

f

p

s

T

i

m

e

r

 

=

 

0

;

f

u

n

c

t

i

o

n

 

l

o

o

p

(

)

 

{

 

 

r

e

q

u

e

s

t

A

n

i

m

a

t

i

o

n

F

r

a

m

e

(

l

o

o

p

)

;

 

 

c

o

n

s

t

 

d

t

 

=

 

M

a

t

h

.

m

i

n

(

c

l

o

c

k

.

g

e

t

D

e

l

t

a

(

)

,

 

0

.

0

5

)

;

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

)

 

{

 

 

 

 

g

a

m

e

.

e

l

a

p

s

e

d

 

+

=

 

d

t

;

 

 

 

 

p

l

a

y

e

r

.

u

p

d

a

t

e

(

d

t

,

 

i

n

p

u

t

)

;

 

 

 

 

i

n

p

u

t

.

j

u

m

p

 

=

 

f

a

l

s

e

;

 

/

/

 

?

먰

봽

?

?

1

?

꾨

젅

?

?

?

꾩

뒪

 

 

 

 

n

o

i

s

e

.

u

p

d

a

t

e

(

d

t

)

;

 

 

 

 

m

o

n

s

t

e

r

.

u

p

d

a

t

e

(

d

t

,

 

p

l

a

y

e

r

)

;

 

 

 

 

/

/

 

異

⑹

쟾

?

?

諛

고

꽣

由

?

(

?

덉

쟾

吏



?



?

먯

꽌

留

?

 

 

 

 

c

o

n

s

t

 

c

s

 

=

 

w

o

r

l

d

.

c

h

a

r

g

e

S

t

a

t

i

o

n

;

 

 

 

 

p

l

a

y

e

r

.

c

h

a

r

g

i

n

g

 

=

 

p

l

a

y

e

r

.

i

n

S

a

f

e

Z

o

n

e

 

&

&

 

!

!

c

s

 

&

&

 

 

 

 

 

 

M

a

t

h

.

h

y

p

o

t

(

c

s

.

x

 

-

 

p

l

a

y

e

r

.

x

,

 

c

s

.

z

 

-

 

p

l

a

y

e

r

.

z

)

 

<

 

C

O

N

F

I

G

.

i

n

t

e

r

a

c

t

i

o

n

.

c

h

a

r

g

e

R

a

n

g

e

 

&

&

 

 

 

 

 

 

p

l

a

y

e

r

.

b

a

t

t

e

r

y

 

<

 

C

O

N

F

I

G

.

b

a

t

t

e

r

y

.

m

a

x

;

 

 

 

 

i

f

 

(

c

s

)

 

c

s

.

s

e

t

A

c

t

i

v

e

(

p

l

a

y

e

r

.

c

h

a

r

g

i

n

g

)

;

 

 

 

 

i

f

 

(

p

l

a

y

e

r

.

b

a

t

t

e

r

y

L

o

w

 

&

&

 

!

g

a

m

e

.

b

a

t

t

e

r

y

W

a

r

n

e

d

)

 

{

 

 

 

 

 

 

g

a

m

e

.

b

a

t

t

e

r

y

W

a

r

n

e

d

 

=

 

t

r

u

e

;

 

 

 

 

 

 

u

i

.

t

o

a

s

t

(

"

諛

고

꽣

由

?

遺



議

?

?

?

?

먯

쟾

?

깆

씠

 

怨

?

爰

쇱

쭛

?

덈

떎

"

,

 

2

6

0

0

)

;

 

 

 

 

}

 

 

 

 

i

f

 

(

!

p

l

a

y

e

r

.

b

a

t

t

e

r

y

L

o

w

)

 

g

a

m

e

.

b

a

t

t

e

r

y

W

a

r

n

e

d

 

=

 

f

a

l

s

e

;

 

 

 

 

/

/

 

紐

ъ

뒪

?

?

議

곗

슦

 

移

댁

슫

?

?

 

 

 

 

i

f

 

(

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

C

H

A

S

E

 

&

&

 

g

a

m

e

.

l

a

s

t

M

o

n

s

t

e

r

S

t

a

t

e

 

!

=

=

 

S

T

A

T

E

.

C

H

A

S

E

)

 

g

a

m

e

.

e

n

c

o

u

n

t

e

r

s

+

+

;

 

 

 

 

g

a

m

e

.

l

a

s

t

M

o

n

s

t

e

r

S

t

a

t

e

 

=

 

m

o

n

s

t

e

r

.

s

t

a

t

e

;

 

 

 

 

u

p

d

a

t

e

O

b

j

e

c

t

i

v

e

s

(

d

t

)

;

 

 

 

 

/

/

 

怨

듯

룷

?

?

 

 

 

 

c

o

n

s

t

 

d

i

s

t

 

=

 

M

a

t

h

.

h

y

p

o

t

(

m

o

n

s

t

e

r

.

x

 

-

 

p

l

a

y

e

r

.

x

,

 

m

o

n

s

t

e

r

.

z

 

-

 

p

l

a

y

e

r

.

z

)

;

 

 

 

 

c

o

n

s

t

 

p

r

o

x

i

m

i

t

y

 

=

 

c

l

a

m

p

(

1

 

-

 

d

i

s

t

 

/

 

2

6

,

 

0

,

 

1

)

;

 

 

 

 

c

o

n

s

t

 

f

e

a

r

T

a

r

g

e

t

 

=

 

c

l

a

m

p

(

M

a

t

h

.

m

a

x

(

p

r

o

x

i

m

i

t

y

,

 

n

o

i

s

e

.

l

e

v

e

l

 

*

 

0

.

5

,

 

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

C

H

A

S

E

 

?

 

0

.

7

 

:

 

0

)

,

 

0

,

 

1

)

;

 

 

 

 

f

e

a

r

 

=

 

d

a

m

p

(

f

e

a

r

,

 

f

e

a

r

T

a

r

g

e

t

,

 

2

.

2

,

 

d

t

)

;

 

 

 

 

u

i

.

s

e

t

F

e

a

r

(

f

e

a

r

)

;

 

 

 

 

a

u

d

i

o

.

s

e

t

A

m

b

i

e

n

t

M

o

o

d

(

f

e

a

r

)

;

 

 

 

 

a

u

d

i

o

.

h

e

a

r

t

b

e

a

t

(

f

e

a

r

,

 

d

t

)

;

 

 

 

 

/

/

 

寃

쎄

퀬

 

諛

곕

꼫

 

 

 

 

i

f

 

(

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

C

H

A

S

E

 

&

&

 

d

i

s

t

 

<

 

3

4

)

 

u

i

.

s

e

t

A

l

e

r

t

(

"

?

꾨

쭩

爾

?

?

?

泥

?

랬

?

먭

?

 

?

⑤

떎

"

)

;

 

 

 

 

e

l

s

e

 

i

f

 

(

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

I

N

V

E

S

T

I

G

A

T

E

 

&

&

 

d

i

s

t

 

<

 

2

0

)

 

u

i

.

s

e

t

A

l

e

r

t

(

"

泥

?

랬

?

먭

?

 

?

뚮

━

 

諛

⑺

뼢

?

쇰

줈

 

?

묎

렐

?

쒕

떎

"

)

;

 

 

 

 

e

l

s

e

 

i

f

 

(

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

S

E

A

R

C

H

 

&

&

 

d

i

s

t

 

<

 

1

4

)

 

u

i

.

s

e

t

A

l

e

r

t

(

"

泥

?

랬

?

먭

?

 

?



?

좎

쿂

瑜

?

?

ㅼ

쭊

?

?

)

;

 

 

 

 

e

l

s

e

 

u

i

.

s

e

t

A

l

e

r

t

(

n

u

l

l

)

;

 

 

 

 

/

/

 

泥

?

랬

?

먭

?

 

?

ㅺ

?

?

ㅻ

㈃

 

議

곕

챸

?

?

'

?

뷀

?

'

泥

섎

읆

 

遺

됯

쾶

 

踰

덉

졇

媛

꾨

떎

 

 

 

 

w

o

r

l

d

.

d

i

s

t

r

e

s

s

 

=

 

(

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

C

H

A

S

E

 

|

|

 

m

o

n

s

t

e

r

.

s

t

a

t

e

 

=

=

=

 

S

T

A

T

E

.

A

T

T

A

C

K

)

 

 

 

 

 

 

?

 

{

 

x

:

 

m

o

n

s

t

e

r

.

x

,

 

z

:

 

m

o

n

s

t

e

r

.

z

 

}

 

 

 

 

 

 

:

 

n

u

l

l

;

 

 

 

 

/

/

 

?

섍

꼍

 

怨

듯

룷

 

 

 

 

g

a

m

e

.

a

m

b

i

e

n

t

T

i

m

e

r

 

-

=

 

d

t

;

 

 

 

 

i

f

 

(

g

a

m

e

.

a

m

b

i

e

n

t

T

i

m

e

r

 

<

=

 

0

)

 

{

 

 

 

 

 

 

g

a

m

e

.

a

m

b

i

e

n

t

T

i

m

e

r

 

=

 

r

a

n

d

(

C

O

N

F

I

G

.

a

s

s

i

s

t

.

a

m

b

i

e

n

t

S

c

a

r

e

M

i

n

,

 

C

O

N

F

I

G

.

a

s

s

i

s

t

.

a

m

b

i

e

n

t

S

c

a

r

e

M

a

x

)

;

 

 

 

 

 

 

i

f

 

(

d

i

s

t

 

>

 

2

2

)

 

t

r

i

g

g

e

r

A

m

b

i

e

n

t

S

c

a

r

e

(

)

;

 

 

 

 

}

 

 

}

 

e

l

s

e

 

{

 

 

 

 

n

o

i

s

e

.

u

p

d

a

t

e

(

d

t

)

;

 

 

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

a

u

s

e

d

"

)

 

{

 

 

 

 

 

 

c

o

n

s

t

 

d

 

=

 

M

a

t

h

.

h

y

p

o

t

(

m

o

n

s

t

e

r

.

x

 

-

 

p

l

a

y

e

r

.

x

,

 

m

o

n

s

t

e

r

.

z

 

-

 

p

l

a

y

e

r

.

z

)

;

 

 

 

 

 

 

u

i

.

s

e

t

A

l

e

r

t

(

n

u

l

l

)

;

 

 

 

 

}

 

 

}

 

 

/

/

 

?

먰

봽

?

ㅼ

?

?

?

?



?

대

㉧

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

s

c

a

r

i

n

g

"

)

 

{

 

 

 

 

g

a

m

e

.

s

c

a

r

e

T

i

m

e

r

 

+

=

 

d

t

;

 

 

 

 

p

l

a

y

e

r

.

a

d

d

C

a

m

e

r

a

S

h

a

k

e

(

0

.

6

5

)

;

 

 

 

 

i

f

 

(

g

a

m

e

.

s

c

a

r

e

T

i

m

e

r

 

>

 

1

.

4

5

)

 

f

i

n

i

s

h

S

c

a

r

e

(

)

;

 

 

}

 

 

/

/

 

洹

몃

┝

?

?

?

곗

텧

 

?



?

대

㉧

 

 

i

f

 

(

s

h

a

d

o

w

S

p

r

i

t

e

)

 

{

 

 

 

 

s

h

a

d

o

w

T

i

m

e

r

 

-

=

 

d

t

;

 

 

 

 

s

h

a

d

o

w

S

p

r

i

t

e

.

m

a

t

e

r

i

a

l

.

o

p

a

c

i

t

y

 

=

 

c

l

a

m

p

(

s

h

a

d

o

w

T

i

m

e

r

 

/

 

0

.

3

4

,

 

0

,

 

1

)

 

*

 

0

.

9

2

;

 

 

 

 

i

f

 

(

s

h

a

d

o

w

T

i

m

e

r

 

<

=

 

0

)

 

{

 

s

c

e

n

e

.

r

e

m

o

v

e

(

s

h

a

d

o

w

S

p

r

i

t

e

)

;

 

s

h

a

d

o

w

S

p

r

i

t

e

.

m

a

t

e

r

i

a

l

.

m

a

p

.

d

i

s

p

o

s

e

(

)

;

 

s

h

a

d

o

w

S

p

r

i

t

e

.

m

a

t

e

r

i

a

l

.

d

i

s

p

o

s

e

(

)

;

 

s

h

a

d

o

w

S

p

r

i

t

e

 

=

 

n

u

l

l

;

 

}

 

 

}

 

 

p

e

r

f

T

i

c

k

(

d

t

)

;

 

 

w

o

r

l

d

.

u

p

d

a

t

e

(

d

t

,

 

g

a

m

e

.

e

l

a

p

s

e

d

)

;

 

 

u

i

.

u

p

d

a

t

e

(

d

t

)

;

 

 

/

/

 

H

U

D

 

?

숆

린

?

?

 

 

i

f

 

(

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

l

a

y

i

n

g

"

 

|

|

 

g

a

m

e

.

p

h

a

s

e

 

=

=

=

 

"

p

a

u

s

e

d

"

)

 

{

 

 

 

 

u

i

.

s

e

t

N

o

i

s

e

(

n

o

i

s

e

.

l

e

v

e

l

)

;

 

 

 

 

u

i

.

s

e

t

S

t

a

m

i

n

a

(

p

l

a

y

e

r

.

s

t

a

m

i

n

a

 

/

 

C

O

N

F

I

G

.

s

t

a

m

i

n

a

.

m

a

x

)

;

 

 

 

 

u

i

.

s

e

t

B

a

t

t

e

r

y

(

p

l

a

y

e

r

.

b

a

t

t

e

r

y

 

/

 

C

O

N

F

I

G

.

b

a

t

t

e

r

y

.

m

a

x

)

;

 

 

 

 

u

i

.

s

e

t

S

a

f

e

Z

o

n

e

(

p

l

a

y

e

r

.

i

n

S

a

f

e

Z

o

n

e

,

 

p

l

a

y

e

r

.

c

h

a

r

g

i

n

g

)

;

 

 

 

 

u

i

.

s

e

t

M

i

c

(

n

o

i

s

e

.

m

i

c

S

t

a

t

e

)

;

 

 

}

 

 

r

e

n

d

e

r

e

r

.

r

e

n

d

e

r

(

s

c

e

n

e

,

 

c

a

m

e

r

a

)

;

}

l

e

t

 

f

e

a

r

 

=

 

0

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

깅

뒫

 

?

먮

룞

 

議

곗

젅

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

l

e

t

 

p

e

r

f

A

c

c

 

=

 

0

,

 

p

e

r

f

F

r

a

m

e

s

 

=

 

0

,

 

p

e

r

f

L

e

v

e

l

 

=

 

0

;

f

u

n

c

t

i

o

n

 

p

e

r

f

T

i

c

k

(

d

t

)

 

{

 

 

p

e

r

f

A

c

c

 

+

=

 

d

t

;

 

p

e

r

f

F

r

a

m

e

s

+

+

;

 

 

i

f

 

(

p

e

r

f

A

c

c

 

<

 

1

.

5

)

 

r

e

t

u

r

n

;

 

 

c

o

n

s

t

 

f

p

s

 

=

 

p

e

r

f

F

r

a

m

e

s

 

/

 

p

e

r

f

A

c

c

;

 

 

p

e

r

f

A

c

c

 

=

 

0

;

 

p

e

r

f

F

r

a

m

e

s

 

=

 

0

;

 

 

i

f

 

(

f

p

s

 

<

 

2

8

 

&

&

 

p

e

r

f

L

e

v

e

l

 

<

 

2

)

 

{

 

 

 

 

p

e

r

f

L

e

v

e

l

+

+

;

 

 

 

 

i

f

 

(

p

e

r

f

L

e

v

e

l

 

=

=

=

 

1

)

 

{

 

 

 

 

 

 

r

e

n

d

e

r

e

r

.

s

h

a

d

o

w

M

a

p

.

e

n

a

b

l

e

d

 

=

 

f

a

l

s

e

;

 

 

 

 

 

 

w

o

r

l

d

.

s

e

t

S

h

a

d

o

w

s

(

f

a

l

s

e

)

;

 

 

 

 

 

 

a

p

p

l

y

P

i

x

e

l

R

a

t

i

o

(

1

.

0

)

;

 

 

 

 

 

 

u

i

.

t

o

a

s

t

(

"

?

먰

솢

?

?

?

뚮

젅

?

대

?

 

?

꾪

빐

 

洹

몃

옒

?

쎌

쓣

 

?

?

톬

?

듬

땲

?

?

,

 

2

6

0

0

)

;

 

 

 

 

}

 

e

l

s

e

 

{

 

 

 

 

 

 

i

f

 

(

w

o

r

l

d

.

g

r

a

s

s

)

 

w

o

r

l

d

.

g

r

a

s

s

.

v

i

s

i

b

l

e

 

=

 

f

a

l

s

e

;

 

 

 

 

 

 

u

i

.

t

o

a

s

t

(

"

?

먰

솢

?

?

?

뚮

젅

?

대

?

 

?

꾪

빐

 

?

붾

뵒

瑜

?

?

④

꼈

?

듬

땲

?

?

,

 

2

6

0

0

)

;

 

 

 

 

}

 

 

}

}

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

由

ъ

궗

?

댁

쫰

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

w

i

n

d

o

w

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

r

e

s

i

z

e

"

,

 

(

)

 

=

>

 

{

 

 

c

a

m

e

r

a

.

a

s

p

e

c

t

 

=

 

w

i

n

d

o

w

.

i

n

n

e

r

W

i

d

t

h

 

/

 

w

i

n

d

o

w

.

i

n

n

e

r

H

e

i

g

h

t

;

 

 

c

a

m

e

r

a

.

u

p

d

a

t

e

P

r

o

j

e

c

t

i

o

n

M

a

t

r

i

x

(

)

;

 

 

r

e

n

d

e

r

e

r

.

s

e

t

S

i

z

e

(

w

i

n

d

o

w

.

i

n

n

e

r

W

i

d

t

h

,

 

w

i

n

d

o

w

.

i

n

n

e

r

H

e

i

g

h

t

)

;

}

)

;

/

*

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

?

ㅼ

젙

 

U

I

 

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

=

 

*

/

c

o

n

s

t

 

s

e

t

S

e

n

s

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

s

e

n

s

"

)

;

c

o

n

s

t

 

s

e

t

S

e

n

s

V

a

l

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

s

e

n

s

-

v

a

l

"

)

;

c

o

n

s

t

 

s

e

t

I

n

v

y

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

i

n

v

y

"

)

;

c

o

n

s

t

 

s

e

t

V

o

l

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

v

o

l

"

)

;

c

o

n

s

t

 

s

e

t

V

o

l

V

a

l

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

v

o

l

-

v

a

l

"

)

;

c

o

n

s

t

 

s

e

t

M

i

c

S

e

n

s

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

m

i

c

s

e

n

s

"

)

;

c

o

n

s

t

 

s

e

t

M

i

c

S

e

n

s

V

a

l

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

m

i

c

s

e

n

s

-

v

a

l

"

)

;

c

o

n

s

t

 

s

e

t

Q

u

a

l

i

t

y

 

=

 

d

o

c

u

m

e

n

t

.

g

e

t

E

l

e

m

e

n

t

B

y

I

d

(

"

s

e

t

-

q

u

a

l

i

t

y

"

)

;

f

u

n

c

t

i

o

n

 

s

y

n

c

S

e

t

t

i

n

g

s

U

I

(

)

 

{

 

 

s

e

t

S

e

n

s

.

v

a

l

u

e

 

=

 

s

e

t

t

i

n

g

s

.

s

e

n

s

i

t

i

v

i

t

y

;

 

 

s

e

t

S

e

n

s

V

a

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

s

e

t

t

i

n

g

s

.

s

e

n

s

i

t

i

v

i

t

y

.

t

o

F

i

x

e

d

(

2

)

 

+

 

"

x

"

;

 

 

s

e

t

I

n

v

y

.

c

h

e

c

k

e

d

 

=

 

s

e

t

t

i

n

g

s

.

i

n

v

e

r

t

Y

;

 

 

s

e

t

V

o

l

.

v

a

l

u

e

 

=

 

s

e

t

t

i

n

g

s

.

v

o

l

u

m

e

;

 

 

s

e

t

V

o

l

V

a

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

M

a

t

h

.

r

o

u

n

d

(

s

e

t

t

i

n

g

s

.

v

o

l

u

m

e

 

*

 

1

0

0

)

 

+

 

"

%

"

;

 

 

s

e

t

M

i

c

S

e

n

s

.

v

a

l

u

e

 

=

 

s

e

t

t

i

n

g

s

.

m

i

c

S

e

n

s

;

 

 

s

e

t

M

i

c

S

e

n

s

V

a

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

s

e

t

t

i

n

g

s

.

m

i

c

S

e

n

s

.

t

o

F

i

x

e

d

(

1

)

 

+

 

"

x

"

;

 

 

s

e

t

Q

u

a

l

i

t

y

.

v

a

l

u

e

 

=

 

s

e

t

t

i

n

g

s

.

q

u

a

l

i

t

y

;

}

s

y

n

c

S

e

t

t

i

n

g

s

U

I

(

)

;

s

e

t

S

e

n

s

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

i

n

p

u

t

"

,

 

(

)

 

=

>

 

{

 

s

e

t

t

i

n

g

s

.

s

e

n

s

i

t

i

v

i

t

y

 

=

 

p

a

r

s

e

F

l

o

a

t

(

s

e

t

S

e

n

s

.

v

a

l

u

e

)

;

 

s

e

t

S

e

n

s

V

a

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

s

e

t

t

i

n

g

s

.

s

e

n

s

i

t

i

v

i

t

y

.

t

o

F

i

x

e

d

(

2

)

 

+

 

"

x

"

;

 

s

a

v

e

S

e

t

t

i

n

g

s

(

)

;

 

}

)

;

s

e

t

I

n

v

y

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

h

a

n

g

e

"

,

 

(

)

 

=

>

 

{

 

s

e

t

t

i

n

g

s

.

i

n

v

e

r

t

Y

 

=

 

s

e

t

I

n

v

y

.

c

h

e

c

k

e

d

;

 

s

a

v

e

S

e

t

t

i

n

g

s

(

)

;

 

}

)

;

s

e

t

V

o

l

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

i

n

p

u

t

"

,

 

(

)

 

=

>

 

{

 

s

e

t

t

i

n

g

s

.

v

o

l

u

m

e

 

=

 

p

a

r

s

e

F

l

o

a

t

(

s

e

t

V

o

l

.

v

a

l

u

e

)

;

 

s

e

t

V

o

l

V

a

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

M

a

t

h

.

r

o

u

n

d

(

s

e

t

t

i

n

g

s

.

v

o

l

u

m

e

 

*

 

1

0

0

)

 

+

 

"

%

"

;

 

a

u

d

i

o

.

s

e

t

V

o

l

u

m

e

(

s

e

t

t

i

n

g

s

.

v

o

l

u

m

e

)

;

 

s

a

v

e

S

e

t

t

i

n

g

s

(

)

;

 

}

)

;

s

e

t

M

i

c

S

e

n

s

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

i

n

p

u

t

"

,

 

(

)

 

=

>

 

{

 

s

e

t

t

i

n

g

s

.

m

i

c

S

e

n

s

 

=

 

p

a

r

s

e

F

l

o

a

t

(

s

e

t

M

i

c

S

e

n

s

.

v

a

l

u

e

)

;

 

s

e

t

M

i

c

S

e

n

s

V

a

l

.

t

e

x

t

C

o

n

t

e

n

t

 

=

 

s

e

t

t

i

n

g

s

.

m

i

c

S

e

n

s

.

t

o

F

i

x

e

d

(

1

)

 

+

 

"

x

"

;

 

n

o

i

s

e

.

s

e

t

M

i

c

S

e

n

s

i

t

i

v

i

t

y

(

s

e

t

t

i

n

g

s

.

m

i

c

S

e

n

s

)

;

 

s

a

v

e

S

e

t

t

i

n

g

s

(

)

;

 

}

)

;

s

e

t

Q

u

a

l

i

t

y

.

a

d

d

E

v

e

n

t

L

i

s

t

e

n

e

r

(

"

c

h

a

n

g

e

"

,

 

(

)

 

=

>

 

{

 

 

s

e

t

t

i

n

g

s

.

q

u

a

l

i

t

y

 

=

 

s

e

t

Q

u

a

l

i

t

y

.

v

a

l

u

e

;

 

 

s

a

v

e

S

e

t

t

i

n

g

s

(

)

;

 

 

u

i

.

t

o

a

s

t

(

"

?

붿

쭏

?



 

?

ㅼ

쓬

 

?

쒖

옉

 

?

?

?

곸

슜

?

⑸

땲

?

?

,

 

2

4

0

0

)

;

}

)

;

/

/

 

珥

덇

린

 

?

곹

깭

u

i

.

s

e

t

M

i

c

(

"

o

f

f

"

)

;

u

i

.

s

e

t

F

l

a

s

h

l

i

g

h

t

(

t

r

u

e

)

;

u

i

.

s

e

t

H

u

d

V

i

s

i

b

l

e

(

f

a

l

s

e

)

;

 

u

i

.

s

e

t

I

n

v

e

n

t

o

r

y

(

p

l

a

y

e

r

.

i

n

v

e

n

t

o

r

y

)

;

/

/

 

?

붾

쾭

洹

?

?

뚯

뒪

?

몄

슜

 

?

?

w

i

n

d

o

w

.

_

_

s

i

l

e

n

c

e

 

=

 

{

 

g

a

m

e

,

 

p

l

a

y

e

r

,

 

m

o

n

s

t

e

r

,

 

n

o

i

s

e

,

 

w

o

r

l

d

,

 

u

i

,

 

s

e

t

t

i

n

g

s

,

 

S

T

A

T

E

,

 

i

n

p

u

t

,

 

a

u

d

i

o

,

 

r

e

n

d

e

r

e

r

,

 

c

a

m

e

r

a

,

 

s

c

e

n

e

,

 

T

H

R

E

E

 

}

;

l

o

o

p

(

)

;

