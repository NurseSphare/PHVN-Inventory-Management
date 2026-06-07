(function(){
  var MOBILE_BREAK = 1180;
  var navbars = [];
  var backdrop = null;

  function ensureBackdrop(){
    if(backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.className = 'mobile-nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', function(){
      navbars.forEach(closeNavbar);
    });
    return backdrop;
  }

  function closeNavbar(navbar){
    var toggle = navbar.querySelector('.mobile-nav-toggle');
    navbar.classList.remove('nav-open');
    if(toggle){
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
    }
    document.body.classList.remove('nav-menu-open');
  }

  function openNavbar(navbar){
    var toggle = navbar.querySelector('.mobile-nav-toggle');
    navbar.classList.add('nav-open');
    if(toggle){
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
    }
    document.body.classList.add('nav-menu-open');
  }

  function createToggle(){
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-nav-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');

    var box = document.createElement('span');
    box.className = 'hamburger-box';
    box.setAttribute('aria-hidden', 'true');

    for(var i = 0; i < 3; i++){
      var line = document.createElement('span');
      line.className = 'hamburger-line';
      box.appendChild(line);
    }

    toggle.appendChild(box);
    return toggle;
  }

  function setupMobileNav(){
    ensureBackdrop();

    document.querySelectorAll('.navbar').forEach(function(navbar){
      if(navbar.querySelector('.mobile-nav-toggle')) return;

      var toggle = createToggle();
      var brand = navbar.querySelector('.brand');

      if(brand && brand.nextSibling){
        brand.parentNode.insertBefore(toggle, brand.nextSibling);
      }else{
        navbar.insertBefore(toggle, navbar.firstChild);
      }

      toggle.addEventListener('click', function(e){
        e.stopPropagation();
        if(navbar.classList.contains('nav-open')){
          closeNavbar(navbar);
        }else{
          navbars.forEach(function(other){
            if(other !== navbar) closeNavbar(other);
          });
          openNavbar(navbar);
        }
      });

      navbar.querySelectorAll('.nav-links a').forEach(function(link){
        link.addEventListener('click', function(){
          closeNavbar(navbar);
        });
      });

      navbar.querySelectorAll('.nav-actions a, .nav-actions button').forEach(function(action){
        action.addEventListener('click', function(){
          closeNavbar(navbar);
        });
      });

      navbars.push(navbar);
    });

    if(!document.documentElement.dataset.mobileNavBound){
      document.documentElement.dataset.mobileNavBound = '1';

      document.addEventListener('keydown', function(e){
        if(e.key !== 'Escape') return;
        navbars.forEach(closeNavbar);
      });

      window.addEventListener('resize', function(){
        if(window.innerWidth > MOBILE_BREAK){
          navbars.forEach(closeNavbar);
        }
      });
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setupMobileNav);
  }else{
    setupMobileNav();
  }
})();
