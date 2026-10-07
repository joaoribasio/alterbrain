#show: doc => letter(
$if(sender)$
  sender: (
$if(sender.name)$    name: [$sender.name$],
$endif$
$if(sender.address)$    address: ($for(sender.address)$[$it$],$endfor$),
$endif$
$if(sender.email)$    email: [$sender.email$],
$endif$
$if(sender.phone)$    phone: [$sender.phone$],
$endif$
$if(sender.link)$    link: [$sender.link$],
$endif$
  ),
$endif$
$if(recipient)$
  recipient: (
$if(recipient.name)$    name: [$recipient.name$],
$endif$
$if(recipient.role)$    role: [$recipient.role$],
$endif$
$if(recipient.company)$    company: [$recipient.company$],
$endif$
$if(recipient.address)$    address: ($for(recipient.address)$[$it$],$endfor$),
$endif$
  ),
$endif$
$if(place)$
  place: [$place$],
$endif$
$if(date)$
  date: [$date$],
$endif$
$if(subject)$
  subject: [$subject$],
$endif$
$if(reference)$
  reference: [$reference$],
$endif$
$if(salutation)$
  salutation: [$salutation$],
$endif$
$if(closing)$
  closing: [$closing$],
$endif$
$if(signature)$
  signature: [$signature$],
$endif$
$if(enclosures)$
  enclosures: [$enclosures$],
$endif$
$if(mainfont)$
  font: ("$mainfont$",),
$elseif(brand.typography.base.family)$
  font: $brand.typography.base.family$ + ("Arial",),
$endif$
$if(fontsize)$
  fontsize: $fontsize$,
$endif$
$if(lang)$
  lang: "$lang$",
$endif$
  accent: brand-color.at("primary", default: rgb("#1F3A5F")),
  doc,
)
