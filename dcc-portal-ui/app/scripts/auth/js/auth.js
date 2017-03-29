/*
 * Copyright 2016(c) The Ontario Institute for Cancer Research. All rights reserved.
 *
 * This program and the accompanying materials are made available under the terms of the GNU Public
 * License v3.0. You should have received a copy of the GNU General Public License along with this
 * program. If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
 * WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function () {
  'use strict';

  angular.module('icgc.auth', ['icgc.auth.controllers', 'icgc.auth.directives']);
})();

(function () {
  'use strict';

  angular.module('icgc.auth.models', []);

  angular.module('icgc.auth.models').factory('Auth', function ($window, $cookies, Restangular, Settings) {
    var user = {}, handler = Restangular.one('auth').withHttpConfig({cache: false});

    function hasSession() {
      console.debug('Checking for active session...');
      return !!$cookies.dcc_session;
    }

    function checkSession(succ) {
      user.verifying = true;
      Settings.get().then(function(settings){
         if (!settings.authEnabled){
            user.disabled = true;
            user.verifying = false;
            return;
         }
         var ohsutoken = $window.localStorage.getItem('ohsutoken');
         if (ohsutoken) {
           user.verifying = false;
           console.log('ohsutoken present');
           user.token = ohsutoken;
         }
         handler.one('verify').get().then(succ, function(){
           user.verifying = false;
         });
      });
    }

    function login(data) {
      delete $cookies.openid_error;
      user = {
        email: data.username || 'Unknown User',
        token: data.token || false,
        daco: data.daco || false,
        verifying: false,
        cloudAccess: data.cloudAccess || false
      };
    }

    function deleteCookies() {
      delete $cookies.dcc_session;
      delete $cookies.dcc_user;
      Restangular.setDefaultRequestParams({});
      $window.localStorage.removeItem('ohsutoken');
      $window.location.reload();
    }

    function logout() {
      user.verifying = false;
      handler.post('logout').then(function () {
        deleteCookies();
      });
    }

    function getUser() {
      return user;
    }

    return {
      hasSession: hasSession,
      checkSession: checkSession,
      login: login,
      logout: logout,
      deleteCookies: deleteCookies,
      getUser: getUser
    };
  });

  angular.module('icgc.auth.models').factory('CUD', function ($window, Settings) {
    function login(provider) {
      Settings.get().then(function(settings) {
        if (provider === 'icgc') {
          redirect(settings.ssoUrl);
        } else if (provider === 'google') {
          redirect(settings.ssoUrlGoogle);
        }
      });
    }

    function redirect(url) {
      $window.location = url + encodeURIComponent($window.location.href);
    }

    return {
      login: login,
      redirect: redirect
    };
  });

  angular.module('icgc.auth.models').factory('OHSU', function (Restangular, $window, $cookies, Auth) {
    var handler = Restangular.one('ohsulogin');

    function login(osDomain, osUsername, osPassword) {
      var credentials = {'domain': osDomain, 'user': osUsername, 'password': osPassword};
      $window.localStorage.setItem('ohsu-refresh-needed', 'true');
      return handler.withHttpConfig({
          transformRequest: function(data) {
              return JSON.stringify(data);
          }
      }).customPOST(credentials, undefined, undefined, {
          'Content-Type': 'application/json'
      });

    }

    function logout() {
      $cookies.ohsulogin_error = undefined;
      $window.localStorage.removeItem('ohsutoken');
    }


    function getErrors() {
      return $cookies.ohsulogin_error;
    }

    function hasErrors() {
      return !!$cookies.ohsulogin_error;
    }

    function refreshNeeded() {
      return $window.localStorage.getItem('ohsu-refresh-needed');
    }

    function refreshDone() {
      return $window.localStorage.removeItem('ohsu-refresh-needed');
    }

    return {
      login: login,
      logout: logout,
      getErrors: getErrors,
      hasErrors: hasErrors,
      refreshNeeded: refreshNeeded,
      refreshDone: refreshDone
    };
  });


  angular.module('icgc.auth.models').factory('OpenID', function (Restangular, $window, $cookies) {
    var handler = Restangular.one('auth/openid');

    function provider(identifier) {
      return handler.post(
        'provider', {}, {identifier: identifier,
          currentUrl: encodeURIComponent($window.location.pathname + $window.location.search)}
      ).then(function (response) {
          $window.location = response.replace(/"/g, '');
        });
    }

    function getErrors() {
      return $cookies.openid_error;
    }

    function hasErrors() {
      return !!$cookies.openid_error;
    }

    return {
      provider: provider,
      getErrors: getErrors,
      hasErrors: hasErrors
    };
  });
})();


(function () {
  'use strict';

  angular.module('icgc.auth.controllers', ['icgc.auth.models']);

  angular.module('icgc.auth.controllers').controller('authController',
    function ($window, $scope, $location, $modal, Auth, CUD, OpenID, $state, $stateParams,
      PortalFeature, gettextCatalog, OHSU) {

      $scope.params = {};
      $scope.params.provider = 'ohsu';
      $scope.params.error = null;
      $scope.params.user = null;
      $scope.params.openIDUrl = null;
      $scope.params.osDomain = null;
      $scope.params.osUsername = null;
      $scope.params.osPassword = null;
      $scope.params.cudUsername = null;
      $scope.params.cudPassword = null;
      $scope.params.showCollaboratoryToken = PortalFeature.get('AUTH_TOKEN');

      function shouldRefreshLocation() {
        var shouldRefresh = false,
            urlPath = $location.path().toLowerCase();

        switch(urlPath) {
          // Currently, we only want a refresh for releases.
          case '/releases':
            shouldRefresh = true;
            break;
          default:
            break;
        }

        if ($scope.params.provider === 'ohsu') {
          shouldRefresh = true;
        }

        return shouldRefresh;
      }

      function setup() {
        $scope.params.user = Auth.getUser();
        // Check for errors
        if (OpenID.hasErrors()) {
          $scope.params.error = OpenID.getErrors();
          $scope.loginModal = true;
        } else if (OHSU.hasErrors()) {
          $scope.params.error = OHSU.getErrors();
          $scope.loginModal = true;
        } else {
          Auth.checkSession(
            function (data) {

              // Default to refreshing the page on login
              var transitionParams =  {
                reload: true,
                inherit: true,
                notify: true,
                location: false
              };

              Auth.login(data);
              $scope.params.user = Auth.getUser();

              if (shouldRefreshLocation()) {
                transitionParams.inherit = false;
                transitionParams.location = true;
              }

              // If we are on the homepage (i.e. $state.current.name is falsey) don't bother transitioning...
              if ($state.current.name) {
                $state.transitionTo($state.current, $stateParams, transitionParams);
                if (OHSU.refreshNeeded()) {
                  OHSU.refreshDone();
                  $window.location.reload();
                }
              }

              $scope.closeLoginPopup();
            });
        }
      }

      function errorMap(e) {
        switch (e.code) {
        case '1796':
          /// openIDUrl would be a login provider such as Google, yahoo or ICGC
          return  _.template(gettextCatalog.getString('${openIDUrl} is not a known provider'))({openIDUrl : $scope.params.openIDUrl});
        case '1798':
          /// openIDUrl would be a login provider such as Google, yahoo or ICGC
          return _.template(gettextCatalog.getString('Could not connect to ${openIDUrl}'))({openIDUrl : $scope.params.openIDUrl});
        default:
          return e.message;
        }
      }

      function providerMap(provider) {
        switch (provider) {
        case 'google':
          return 'https://www.google.com/accounts/o8/id';
        case 'yahoo':
          return 'https://me.yahoo.com';
        case 'verisign':
          return 'https://' + $scope.verisignUsername + '.pip.verisignlabs.com/';
        default:
          return $scope.params.openIDUrl;
        }
      }

      var loginInstance, logoutInstance;

      // Auth isn't technically a state, so the default state reload in PortalFeature won't work.
      // We get around this by using a watcher instead on the actual var.
      $scope.$watch(function () {
        return PortalFeature.get('AUTH_TOKEN');
      }, function() {
        $scope.params.showCollaboratoryToken = PortalFeature.get('AUTH_TOKEN');
      });

      $scope.openTokenManagerPopup = function() {
        $modal.open({
          templateUrl: '/scripts/tokens/views/token.manager.html',
          controller: 'TokenController',
          size: 'lg'
        });
      };

      $scope.openLoginPopup = function() {
        loginInstance = $modal.open({
          templateUrl: '/scripts/auth/views/login.popup.html',
          scope: $scope
        });
      };

      $scope.closeLoginPopup = function() {
        if (loginInstance) {
          loginInstance.dismiss('cancel');
          loginInstance = null;
        }
      };

      $scope.openLogoutPopup = function() {
        logoutInstance = $modal.open({
          templateUrl: '/scripts/auth/views/logout.popup.html',
          scope: $scope
        });
      };

      $scope.closeLogoutPopup = function() {
        if (logoutInstance) {
          logoutInstance.dismiss('cancel');
          logoutInstance = null;
        }
      };

      $scope.tryLogin = function () {
        $scope.connecting = true;

        if ( ['ohsu'].indexOf($scope.params.provider) >= 0) {
          console.log('call ohsu login...');
          OHSU.login($scope.params.osDomain, $scope.params.osUsername, $scope.params.osPassword)
            .then(function(response) {
                console.log('handle ohsulogin ok', response);
                $window.localStorage.setItem('ohsutoken',response.id_token);
                Auth.login({token: response.id_token,
                            username: $scope.params.osUsername});
                $scope.connecting = false;
                $scope.params.error = undefined;
                setup();
                $scope.closeLoginPopup();
            }, function(response) {
                console.log('handle ohsulogin error', response);
                $window.localStorage.removeItem('ohsutoken');
                $scope.connecting = false;
                $scope.params.error = response.data + '(' + response.status + ')';
            });
        } else if ( ['icgc', 'google'].indexOf($scope.params.provider) >= 0) {
          CUD.login( $scope.params.provider );
        } else {
          OpenID.provider(providerMap($scope.params.provider)).then(
            function () {},
            function (response) {
              $scope.connecting = false;
              $scope.params.error = errorMap(response.data);
            });
        }
      };

      $scope.logout = function () {
        Auth.logout();
      };

      setup();
    });
})();

(function () {
  'use strict';

  angular.module('icgc.auth.directives', ['icgc.auth.controllers']);


  angular.module('icgc.auth.directives').directive('login', function () {
    return {
      restrict: 'E',
      replace: true,
      transclude: true,
      templateUrl: '/scripts/auth/views/login.html',
      controller: 'authController'
    };
  });


  angular.module('icgc.auth.directives').directive('loginPopup', function () {
    return {
      restrict: 'E',
      replace: true,
      templateUrl: '/scripts/auth/views/login.popup.html'
    };
  });

  angular.module('icgc.auth.directives').directive('logoutPopup', function () {
    return {
      restrict: 'E',
      replace: true,
      templateUrl: '/scripts/auth/views/logout.popup.html'
    };
  });

  angular.module('icgc.auth.directives').directive('authPopup', function () {
    return {
      restrict: 'E',
      replace: true,
      templateUrl: '/scripts/auth/views/auth.popup.html'
    };
  });

})();
